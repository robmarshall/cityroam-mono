import { Hono } from "hono";
import { eq, sql, count, desc, and, asc, inArray, type SQL } from "drizzle-orm";
import Stripe from "stripe";
import { adminLoginSchema, adminUpdateEventStatusSchema, adminCreateEventSchema, routeSchema, imageUploadRequestSchema, messageBankSchema, routeBlockSchema, groupUpdateSchema, bulkRouteGroupCreateSchema, groupReorderSchema, blockReorderSchema } from "@cityroam/shared/validation";
import { generateEventCode } from "@cityroam/shared/utils";
import { EVENT_EXPIRY_DAYS } from "@cityroam/shared/constants";
import { generatePresignedUploadUrl } from "../services/s3.js";
import type { AdminDashboardResponse, AdminEventListResponse, AdminEventDetailResponse, AdminRouteDetailResponse, AdminRouteListResponse, AdminMessageBankListResponse, AdminRouteGroupResponse } from "@cityroam/shared/types";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, participants, messages, routes, messageBanks, routeGroups, routeBlocks } from "../db/schema/index.js";
import { AppError } from "../middleware/error-handler.js";
import { adminAuth, signAdminToken } from "../middleware/admin.js";
import { deleteSessionsByEventId } from "../redis/index.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("admin");

export const adminRoutes = new Hono();

// POST /admin/login — authenticate admin, return JWT
adminRoutes.post("/admin/login", async (c) => {
  const body = await c.req.json();
  const { username, password } = adminLoginSchema.parse(body);

  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const token = await signAdminToken(username);
  return c.json({ token }, 200);
});

// GET /admin/dashboard — admin dashboard stats (requires admin auth)
adminRoutes.get("/admin/dashboard", adminAuth, async (c) => {
  // Count events by status
  const statusCounts = await db
    .select({
      status: events.status,
      count: count(),
    })
    .from(events)
    .groupBy(events.status);

  const counts: Record<string, number> = {
    NOT_STARTED: 0,
    WAITING: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    EXPIRED: 0,
    REFUNDED: 0,
  };

  for (const row of statusCounts) {
    counts[row.status] = Number(row.count);
  }

  // Total revenue events = all events that have a stripe_payment_id (paid)
  const revenueResult = await db
    .select({ count: count() })
    .from(events)
    .where(sql`${events.stripe_payment_id} IS NOT NULL`);

  const total_revenue_events = Number(revenueResult[0]?.count ?? 0);

  // Recent events (last 10)
  const recentEvents = await db
    .select({
      id: events.id,
      code: events.code,
      status: events.status,
      buyer_email: events.buyer_email,
      created_at: events.created_at,
    })
    .from(events)
    .orderBy(desc(events.created_at))
    .limit(10);

  const response: AdminDashboardResponse = {
    counts: counts as AdminDashboardResponse["counts"],
    total_revenue_events,
    recent_events: recentEvents.map((e) => ({
      id: e.id,
      code: e.code,
      status: e.status as AdminDashboardResponse["recent_events"][0]["status"],
      buyer_email: e.buyer_email ?? "",
      created_at: e.created_at.toISOString(),
    })),
  };

  return c.json(response, 200);
});

// GET /admin/events — paginated list, optional status filter
adminRoutes.get("/admin/events", adminAuth, async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const per_page = Math.min(100, Math.max(1, parseInt(c.req.query("per_page") ?? "20", 10) || 20));
  const statusFilter = c.req.query("status");

  const conditions = [];
  if (statusFilter) {
    conditions.push(eq(events.status, statusFilter));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const totalResult = await db
    .select({ count: count() })
    .from(events)
    .where(whereClause);
  const total = Number(totalResult[0]?.count ?? 0);

  // Get paginated events
  const offset = (page - 1) * per_page;
  const eventRows = await db
    .select({
      id: events.id,
      code: events.code,
      buyer_email: events.buyer_email,
      status: events.status,
      created_at: events.created_at,
      refund_requested: events.refund_requested,
    })
    .from(events)
    .where(whereClause)
    .orderBy(desc(events.created_at))
    .limit(per_page)
    .offset(offset);

  // Get participant counts for these events
  const eventIds = eventRows.map((e) => e.id);
  let participantCounts: Record<string, number> = {};
  if (eventIds.length > 0) {
    const countRows = await db
      .select({
        event_id: participants.event_id,
        count: count(),
      })
      .from(participants)
      .where(inArray(participants.event_id, eventIds))
      .groupBy(participants.event_id);

    for (const row of countRows) {
      participantCounts[row.event_id] = Number(row.count);
    }
  }

  const response: AdminEventListResponse = {
    events: eventRows.map((e) => ({
      id: e.id,
      code: e.code,
      buyer_email: e.buyer_email ?? "",
      status: e.status as AdminEventListResponse["events"][0]["status"],
      created_at: e.created_at.toISOString(),
      participant_count: participantCounts[e.id] ?? 0,
      refund_requested: e.refund_requested,
    })),
    total,
    page,
    per_page,
  };

  return c.json(response, 200);
});

// POST /admin/events — create a free event (no Stripe)
adminRoutes.post("/admin/events", adminAuth, async (c) => {
  const body = await c.req.json();
  const data = adminCreateEventSchema.parse(body);

  // Verify route exists
  const route = await db.query.routes.findFirst({
    where: eq(routes.id, data.route_id),
  });
  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  // Generate unique event code with retry on collision
  let eventCode: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateEventCode();
    const conflict = await db.query.events.findFirst({
      where: eq(events.code, candidate),
    });
    if (!conflict) {
      eventCode = candidate;
      break;
    }
  }

  if (!eventCode) {
    log.error("failed to generate unique event code", { attempts: 5 });
    throw new AppError(500, "Failed to generate unique event code", "CODE_GENERATION_FAILED");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (data.expires_in_days ?? EVENT_EXPIRY_DAYS));

  const [created] = await db.insert(events).values({
    code: eventCode,
    status: "NOT_STARTED",
    route_id: data.route_id,
    buyer_email: data.buyer_email ?? null,
    expires_at: expiresAt,
  }).returning();

  log.info("admin created free event", { code: eventCode, route_id: data.route_id });

  return c.json({
    event: {
      id: created.id,
      code: created.code,
      status: created.status,
      route_id: created.route_id,
      buyer_email: created.buyer_email,
      created_at: created.created_at.toISOString(),
      expires_at: created.expires_at.toISOString(),
    },
  }, 201);
});

// GET /admin/events/:id — event detail with participants and messages
adminRoutes.get("/admin/events/:id", adminAuth, async (c) => {
  const id = c.req.param("id");

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  const route = event.route_id
    ? await db.query.routes.findFirst({
        where: eq(routes.id, event.route_id),
        columns: { name: true, total_stops: true },
      })
    : null;

  const eventParticipants = await db
    .select()
    .from(participants)
    .where(eq(participants.event_id, id))
    .orderBy(asc(participants.joined_at));

  const eventMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.event_id, id))
    .orderBy(asc(messages.created_at));

  const response: AdminEventDetailResponse = {
    event: {
      id: event.id,
      code: event.code,
      status: event.status as AdminEventDetailResponse["event"]["status"],
      route_id: event.route_id,
      buyer_email: event.buyer_email ?? "",
      current_stop: event.current_stop,
      hints_given: event.hints_given,
      wrong_attempts: event.wrong_attempts,
      guide_response_count: event.guide_response_count,
      created_at: event.created_at.toISOString(),
      started_at: event.started_at?.toISOString() ?? null,
      completed_at: event.completed_at?.toISOString() ?? null,
      expires_at: event.expires_at.toISOString(),
      lead_participant_id: event.lead_participant_id,
      stripe_session_id: event.stripe_session_id,
      stripe_payment_id: event.stripe_payment_id,
      refund_requested: event.refund_requested,
      refund_note: event.refund_note,
    },
    route_name: route?.name ?? null,
    total_stops: route?.total_stops ?? null,
    participants: eventParticipants.map((p) => ({
      id: p.id,
      event_id: p.event_id,
      display_name: p.display_name,
      is_lead: p.is_lead,
      is_active: p.is_active,
      joined_at: p.joined_at.toISOString(),
      last_seen_at: p.last_seen_at.toISOString(),
      left_at: p.left_at?.toISOString() ?? null,
      left_reason: p.left_reason as any,
    })),
    messages: eventMessages.map((m) => ({
      id: m.id,
      event_id: m.event_id,
      step_number: m.step_number,
      sender_type: m.sender_type as any,
      sender_name: m.sender_name,
      participant_id: m.participant_id,
      content: m.content,
      image_url: m.image_url,
      created_at: m.created_at.toISOString(),
    })),
    stripe_payment_id: event.stripe_payment_id,
  };

  return c.json(response, 200);
});

// PATCH /admin/events/:id — update event status
adminRoutes.patch("/admin/events/:id", adminAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = adminUpdateEventStatusSchema.parse(body);

  const existing = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!existing) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  const updates: Record<string, unknown> = {};
  if (data.status !== undefined) updates.status = data.status;
  if (data.refund_requested !== undefined) updates.refund_requested = data.refund_requested;
  if (data.refund_note !== undefined) updates.refund_note = data.refund_note;

  await db
    .update(events)
    .set(updates)
    .where(eq(events.id, id));

  return c.json({ success: true, ...updates }, 200);
});

// POST /admin/events/:id/refund — issue a Stripe refund and update status
adminRoutes.post("/admin/events/:id/refund", adminAuth, async (c) => {
  const id = c.req.param("id");

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  if (event.status === "REFUNDED") {
    throw new AppError(409, "Event has already been refunded", "ALREADY_REFUNDED");
  }

  if (!event.stripe_payment_id) {
    throw new AppError(400, "Event has no associated payment to refund", "NO_PAYMENT");
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    await stripe.refunds.create({
      payment_intent: event.stripe_payment_id,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      log.error("Stripe refund failed", {
        event_id: id,
        stripe_error_code: err.code,
        stripe_error_type: err.type,
      });

      // Map common Stripe error codes to meaningful messages
      if (err.code === "charge_already_refunded") {
        // Stripe says already refunded — sync our status and return success
        await db.update(events).set({ status: "REFUNDED" }).where(eq(events.id, id));
        try {
          await deleteSessionsByEventId(id);
        } catch (err) {
          log.warn("Failed to invalidate sessions after refund", { event_id: id, err });
        }
        return c.json({ success: true, status: "REFUNDED" }, 200);
      }

      const message = err.message || "Stripe refund failed";
      throw new AppError(502, message, "STRIPE_REFUND_FAILED");
    }
    throw err;
  }

  // Update event status to REFUNDED
  await db
    .update(events)
    .set({ status: "REFUNDED" })
    .where(eq(events.id, id));
  try {
    await deleteSessionsByEventId(id);
  } catch (err) {
    log.warn("Failed to invalidate sessions after refund", { event_id: id, err });
  }

  log.info("Event refunded", { event_id: id, stripe_payment_id: event.stripe_payment_id });

  return c.json({ success: true, status: "REFUNDED" }, 200);
});

// ── S3 Upload ───────────────────────────────────────────────────────

// POST /admin/upload — generate pre-signed S3 PUT URL for image upload
adminRoutes.post("/admin/upload", adminAuth, async (c) => {
  const body = await c.req.json();
  const { filename, content_type } = imageUploadRequestSchema.parse(body);

  // Sanitize filename: strip path separators, keep only safe characters
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  if (!sanitized) {
    throw new AppError(400, "Filename contains no valid characters", "INVALID_FILENAME");
  }
  // Prefix with timestamp to avoid collisions
  const uniqueFilename = `${Date.now()}_${sanitized}`;

  // Use a generic upload path (association happens when the block is updated)
  const key = `uploads/${uniqueFilename}`;

  const result = await generatePresignedUploadUrl(key, content_type);
  return c.json(result, 200);
});

// ── Route CRUD ──────────────────────────────────────────────────────

// GET /admin/routes — list all routes with group counts
adminRoutes.get("/admin/routes", adminAuth, async (c) => {
  const routeRows = await db
    .select()
    .from(routes)
    .orderBy(desc(routes.created_at));

  // Get group counts per route
  const routeIds = routeRows.map((r) => r.id);
  let groupCounts: Record<string, number> = {};
  if (routeIds.length > 0) {
    const countRows = await db
      .select({
        route_id: routeGroups.route_id,
        count: count(),
      })
      .from(routeGroups)
      .where(inArray(routeGroups.route_id, routeIds))
      .groupBy(routeGroups.route_id);

    for (const row of countRows) {
      groupCounts[row.route_id] = Number(row.count);
    }
  }

  const response: AdminRouteListResponse = {
    routes: routeRows.map((r) => ({
      id: r.id,
      city: r.city,
      name: r.name,
      description: r.description ?? "",
      total_stops: r.total_stops,
      estimated_duration_mins: r.estimated_duration_mins,
      estimated_distance_km: Number(r.estimated_distance_km),
      is_active: r.is_active,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      group_count: groupCounts[r.id] ?? 0,
    })),
  };

  return c.json(response, 200);
});

// POST /admin/routes — create a new route
adminRoutes.post("/admin/routes", adminAuth, async (c) => {
  const body = await c.req.json();
  const data = routeSchema.parse(body);

  const [route] = await db
    .insert(routes)
    .values({
      city: data.city,
      name: data.name,
      description: data.description ?? null,
      total_stops: 0,
      estimated_duration_mins: data.estimated_duration_mins,
      estimated_distance_km: String(data.estimated_distance_km),
      is_active: data.is_active,
    })
    .returning();

  return c.json({
    route: {
      id: route.id,
      city: route.city,
      name: route.name,
      description: route.description ?? "",
      total_stops: route.total_stops,
      estimated_duration_mins: route.estimated_duration_mins,
      estimated_distance_km: Number(route.estimated_distance_km),
      is_active: route.is_active,
      created_at: route.created_at.toISOString(),
      updated_at: route.updated_at.toISOString(),
    },
  }, 201);
});

// GET /admin/routes/:id — route detail with groups and blocks
adminRoutes.get("/admin/routes/:id", adminAuth, async (c) => {
  const id = c.req.param("id");

  const route = await db.query.routes.findFirst({
    where: eq(routes.id, id),
  });

  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  // Load groups ordered by position
  const groupRows = await db
    .select()
    .from(routeGroups)
    .where(eq(routeGroups.route_id, id))
    .orderBy(asc(routeGroups.position));

  // Load all blocks for these groups in one query
  const groupIds = groupRows.map((g) => g.id);
  let blockRows: (typeof routeBlocks.$inferSelect)[] = [];
  if (groupIds.length > 0) {
    blockRows = await db
      .select()
      .from(routeBlocks)
      .where(inArray(routeBlocks.group_id, groupIds))
      .orderBy(asc(routeBlocks.position));
  }

  // Index blocks by group_id
  const blocksByGroup: Record<string, typeof blockRows> = {};
  for (const b of blockRows) {
    (blocksByGroup[b.group_id] ??= []).push(b);
  }

  const groups: AdminRouteGroupResponse[] = groupRows.map((g) => ({
    id: g.id,
    route_id: g.route_id,
    position: g.position,
    name: g.name,
    created_at: g.created_at.toISOString(),
    updated_at: g.updated_at.toISOString(),
    blocks: (blocksByGroup[g.id] ?? []).map((b) => ({
      id: b.id,
      group_id: b.group_id,
      position: b.position,
      type: b.type as import("@cityroam/shared/types").BlockType,
      config: b.config as import("@cityroam/shared/types").BlockConfig,
      delay_ms: b.delay_ms,
      created_at: b.created_at.toISOString(),
    })),
  }));

  const response: AdminRouteDetailResponse = {
    route: {
      id: route.id,
      city: route.city,
      name: route.name,
      description: route.description ?? "",
      total_stops: route.total_stops,
      estimated_duration_mins: route.estimated_duration_mins,
      estimated_distance_km: Number(route.estimated_distance_km),
      is_active: route.is_active,
      created_at: route.created_at.toISOString(),
      updated_at: route.updated_at.toISOString(),
    },
    groups,
  };

  return c.json(response, 200);
});

// PUT /admin/routes/:id — update a route
adminRoutes.put("/admin/routes/:id", adminAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = routeSchema.parse(body);

  const existing = await db.query.routes.findFirst({
    where: eq(routes.id, id),
  });

  if (!existing) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  const [updated] = await db
    .update(routes)
    .set({
      city: data.city,
      name: data.name,
      description: data.description ?? null,
      estimated_duration_mins: data.estimated_duration_mins,
      estimated_distance_km: String(data.estimated_distance_km),
      is_active: data.is_active,
      updated_at: new Date(),
    })
    .where(eq(routes.id, id))
    .returning();

  return c.json({
    route: {
      id: updated.id,
      city: updated.city,
      name: updated.name,
      description: updated.description ?? "",
      total_stops: updated.total_stops,
      estimated_duration_mins: updated.estimated_duration_mins,
      estimated_distance_km: Number(updated.estimated_distance_km),
      is_active: updated.is_active,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    },
  }, 200);
});

// DELETE /admin/routes/:id — delete a route (409 if events reference it)
adminRoutes.delete("/admin/routes/:id", adminAuth, async (c) => {
  const id = c.req.param("id");

  const existing = await db.query.routes.findFirst({
    where: eq(routes.id, id),
  });

  if (!existing) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  // Referential integrity check + delete atomically to avoid TOCTOU race
  await db.transaction(async (tx) => {
    const eventCount = await tx
      .select({ count: count() })
      .from(events)
      .where(eq(events.route_id, id));

    if (Number(eventCount[0]?.count ?? 0) > 0) {
      throw new AppError(409, "Cannot delete route: events are linked to this route", "ROUTE_HAS_EVENTS");
    }

    // Groups and blocks cascade-delete via FK
    await tx.delete(routes).where(eq(routes.id, id));
  });

  return c.json({ success: true }, 200);
});

// ── Group + Block CRUD ───────────────────────────────────────────────

// POST /admin/routes/bulk-groups — create a route with groups and blocks in one call
adminRoutes.post("/admin/routes/bulk-groups", adminAuth, async (c) => {
  const body = await c.req.json();
  const data = bulkRouteGroupCreateSchema.parse(body);

  const result = await db.transaction(async (tx) => {
    const [route] = await tx
      .insert(routes)
      .values({
        city: data.route.city,
        name: data.route.name,
        description: data.route.description ?? null,
        total_stops: data.groups.length,
        estimated_duration_mins: data.route.estimated_duration_mins,
        estimated_distance_km: String(data.route.estimated_distance_km),
        is_active: data.route.is_active,
      })
      .returning();

    const insertedGroups: Array<typeof routeGroups.$inferSelect & { blocks: (typeof routeBlocks.$inferSelect)[] }> = [];

    for (let gi = 0; gi < data.groups.length; gi++) {
      const g = data.groups[gi];
      const [group] = await tx
        .insert(routeGroups)
        .values({
          route_id: route.id,
          position: gi,
          name: g.name,
        })
        .returning();

      const insertedBlocks: (typeof routeBlocks.$inferSelect)[] = [];
      for (let bi = 0; bi < g.blocks.length; bi++) {
        const b = g.blocks[bi];
        const [block] = await tx
          .insert(routeBlocks)
          .values({
            group_id: group.id,
            position: b.position ?? bi,
            type: b.type,
            config: b.config,
            delay_ms: b.delay_ms ?? 0,
          })
          .returning();
        insertedBlocks.push(block);
      }

      insertedGroups.push({ ...group, blocks: insertedBlocks });
    }

    return { route, groups: insertedGroups };
  });

  return c.json({
    route: {
      id: result.route.id,
      city: result.route.city,
      name: result.route.name,
      description: result.route.description ?? "",
      total_stops: result.route.total_stops,
      estimated_duration_mins: result.route.estimated_duration_mins,
      estimated_distance_km: Number(result.route.estimated_distance_km),
      is_active: result.route.is_active,
      created_at: result.route.created_at.toISOString(),
      updated_at: result.route.updated_at.toISOString(),
    },
    groups: result.groups.map((g) => ({
      id: g.id,
      route_id: g.route_id,
      position: g.position,
      name: g.name,
      created_at: g.created_at.toISOString(),
      updated_at: g.updated_at.toISOString(),
      blocks: g.blocks.map((b) => ({
        id: b.id,
        group_id: b.group_id,
        position: b.position,
        type: b.type,
        config: b.config,
        delay_ms: b.delay_ms,
        created_at: b.created_at.toISOString(),
      })),
    })),
  }, 201);
});

// POST /admin/routes/:id/groups — create a group for a route
adminRoutes.post("/admin/routes/:id/groups", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const body = await c.req.json();
  const data = groupUpdateSchema.parse(body);

  const route = await db.query.routes.findFirst({
    where: eq(routes.id, routeId),
  });

  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  const [group] = await db.transaction(async (tx) => {
    // Determine next position
    const maxPos = await tx
      .select({ max: sql<number>`COALESCE(MAX(${routeGroups.position}), -1)` })
      .from(routeGroups)
      .where(eq(routeGroups.route_id, routeId));
    const nextPosition = Number(maxPos[0]?.max ?? -1) + 1;

    const [inserted] = await tx
      .insert(routeGroups)
      .values({
        route_id: routeId,
        position: nextPosition,
        name: data.name,
      })
      .returning();

    // Update total_stops to reflect group count
    await tx
      .update(routes)
      .set({ total_stops: nextPosition + 1, updated_at: new Date() })
      .where(eq(routes.id, routeId));

    return [inserted];
  });

  return c.json({
    group: {
      id: group.id,
      route_id: group.route_id,
      position: group.position,
      name: group.name,
      created_at: group.created_at.toISOString(),
      updated_at: group.updated_at.toISOString(),
      blocks: [],
    },
  }, 201);
});

// PUT /admin/routes/:id/groups/reorder — reorder groups (must be before :groupId route)
adminRoutes.put("/admin/routes/:id/groups/reorder", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const body = await c.req.json();
  const { group_ids } = groupReorderSchema.parse(body);

  const route = await db.query.routes.findFirst({
    where: eq(routes.id, routeId),
  });

  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  if (new Set(group_ids).size !== group_ids.length) {
    throw new AppError(400, "Duplicate group IDs", "DUPLICATE_GROUP_IDS");
  }

  await db.transaction(async (tx) => {
    const existingGroups = await tx
      .select({ id: routeGroups.id })
      .from(routeGroups)
      .where(eq(routeGroups.route_id, routeId));

    const existingIds = new Set(existingGroups.map((g) => g.id));

    for (const gid of group_ids) {
      if (!existingIds.has(gid)) {
        throw new AppError(400, `Group ${gid} does not belong to this route`, "INVALID_GROUP_ID");
      }
    }

    if (group_ids.length !== existingGroups.length) {
      throw new AppError(400, "All groups must be included in the reorder", "INCOMPLETE_GROUP_LIST");
    }

    const now = new Date();
    const cases = group_ids
      .map((id: string, i: number) => sql`WHEN ${routeGroups.id} = ${id} THEN ${i}`)
      .reduce((acc: SQL, c: SQL) => sql`${acc} ${c}`);

    await tx
      .update(routeGroups)
      .set({
        position: sql`CASE ${cases} END`,
        updated_at: now,
      })
      .where(inArray(routeGroups.id, group_ids));
  });

  return c.json({ success: true }, 200);
});

// PUT /admin/routes/:id/groups/:groupId — update a group
adminRoutes.put("/admin/routes/:id/groups/:groupId", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const groupId = c.req.param("groupId");
  const body = await c.req.json();
  const data = groupUpdateSchema.parse(body);

  const existing = await db.query.routeGroups.findFirst({
    where: and(eq(routeGroups.id, groupId), eq(routeGroups.route_id, routeId)),
  });

  if (!existing) {
    throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");
  }

  const [updated] = await db
    .update(routeGroups)
    .set({
      name: data.name,
      updated_at: new Date(),
    })
    .where(eq(routeGroups.id, groupId))
    .returning();

  return c.json({
    group: {
      id: updated.id,
      route_id: updated.route_id,
      position: updated.position,
      name: updated.name,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    },
  }, 200);
});

// DELETE /admin/routes/:id/groups/:groupId — delete a group and renumber
adminRoutes.delete("/admin/routes/:id/groups/:groupId", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const groupId = c.req.param("groupId");

  const existing = await db.query.routeGroups.findFirst({
    where: and(eq(routeGroups.id, groupId), eq(routeGroups.route_id, routeId)),
  });

  if (!existing) {
    throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");
  }

  await db.transaction(async (tx) => {
    const now = new Date();

    // Blocks cascade-delete via FK
    await tx.delete(routeGroups).where(eq(routeGroups.id, groupId));

    // Renumber remaining groups
    const remainingGroups = await tx
      .select({ id: routeGroups.id })
      .from(routeGroups)
      .where(eq(routeGroups.route_id, routeId))
      .orderBy(asc(routeGroups.position));

    if (remainingGroups.length > 0) {
      const cases = remainingGroups
        .map((g, i) => sql`WHEN ${routeGroups.id} = ${g.id} THEN ${i}`)
        .reduce((acc, c) => sql`${acc} ${c}`);

      await tx
        .update(routeGroups)
        .set({
          position: sql`CASE ${cases} END`,
          updated_at: now,
        })
        .where(inArray(routeGroups.id, remainingGroups.map((g) => g.id)));
    }

    // Update route total_stops
    await tx
      .update(routes)
      .set({
        total_stops: remainingGroups.length,
        updated_at: now,
      })
      .where(eq(routes.id, routeId));
  });

  return c.json({ success: true }, 200);
});

// POST /admin/groups/:groupId/blocks — create a block for a group
adminRoutes.post("/admin/groups/:groupId/blocks", adminAuth, async (c) => {
  const groupId = c.req.param("groupId");
  const body = await c.req.json();
  const data = routeBlockSchema.parse(body);

  const group = await db.query.routeGroups.findFirst({
    where: eq(routeGroups.id, groupId),
  });

  if (!group) {
    throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");
  }

  const [block] = await db.transaction(async (tx) => {
    const maxPos = await tx
      .select({ max: sql<number>`COALESCE(MAX(${routeBlocks.position}), -1)` })
      .from(routeBlocks)
      .where(eq(routeBlocks.group_id, groupId));
    const nextPosition = Number(maxPos[0]?.max ?? -1) + 1;

    const [inserted] = await tx
      .insert(routeBlocks)
      .values({
        group_id: groupId,
        position: data.position ?? nextPosition,
        type: data.type,
        config: data.config,
        delay_ms: data.delay_ms ?? 0,
      })
      .returning();

    return [inserted];
  });

  return c.json({
    block: {
      id: block.id,
      group_id: block.group_id,
      position: block.position,
      type: block.type,
      config: block.config,
      delay_ms: block.delay_ms,
      created_at: block.created_at.toISOString(),
    },
  }, 201);
});

// PUT /admin/groups/:groupId/blocks/reorder — reorder blocks within a group
adminRoutes.put("/admin/groups/:groupId/blocks/reorder", adminAuth, async (c) => {
  const groupId = c.req.param("groupId");
  const body = await c.req.json();
  const { block_ids } = blockReorderSchema.parse(body);

  const group = await db.query.routeGroups.findFirst({
    where: eq(routeGroups.id, groupId),
  });

  if (!group) {
    throw new AppError(404, "Group not found", "GROUP_NOT_FOUND");
  }

  if (new Set(block_ids).size !== block_ids.length) {
    throw new AppError(400, "Duplicate block IDs", "DUPLICATE_BLOCK_IDS");
  }

  await db.transaction(async (tx) => {
    const existingBlocks = await tx
      .select({ id: routeBlocks.id })
      .from(routeBlocks)
      .where(eq(routeBlocks.group_id, groupId));

    const existingIds = new Set(existingBlocks.map((b) => b.id));

    for (const bid of block_ids) {
      if (!existingIds.has(bid)) {
        throw new AppError(400, `Block ${bid} does not belong to this group`, "INVALID_BLOCK_ID");
      }
    }

    if (block_ids.length !== existingBlocks.length) {
      throw new AppError(400, "All blocks must be included in the reorder", "INCOMPLETE_BLOCK_LIST");
    }

    const cases = block_ids
      .map((id: string, i: number) => sql`WHEN ${routeBlocks.id} = ${id} THEN ${i}`)
      .reduce((acc: SQL, c: SQL) => sql`${acc} ${c}`);

    await tx
      .update(routeBlocks)
      .set({
        position: sql`CASE ${cases} END`,
      })
      .where(inArray(routeBlocks.id, block_ids));
  });

  return c.json({ success: true }, 200);
});

// PUT /admin/blocks/:blockId — update a block
adminRoutes.put("/admin/blocks/:blockId", adminAuth, async (c) => {
  const blockId = c.req.param("blockId");
  const body = await c.req.json();
  const data = routeBlockSchema.parse(body);

  const existing = await db.query.routeBlocks.findFirst({
    where: eq(routeBlocks.id, blockId),
  });

  if (!existing) {
    throw new AppError(404, "Block not found", "BLOCK_NOT_FOUND");
  }

  const [updated] = await db
    .update(routeBlocks)
    .set({
      type: data.type,
      config: data.config,
      delay_ms: data.delay_ms ?? 0,
    })
    .where(eq(routeBlocks.id, blockId))
    .returning();

  return c.json({
    block: {
      id: updated.id,
      group_id: updated.group_id,
      position: updated.position,
      type: updated.type,
      config: updated.config,
      delay_ms: updated.delay_ms,
      created_at: updated.created_at.toISOString(),
    },
  }, 200);
});

// DELETE /admin/blocks/:blockId — delete a block and renumber
adminRoutes.delete("/admin/blocks/:blockId", adminAuth, async (c) => {
  const blockId = c.req.param("blockId");

  const existing = await db.query.routeBlocks.findFirst({
    where: eq(routeBlocks.id, blockId),
  });

  if (!existing) {
    throw new AppError(404, "Block not found", "BLOCK_NOT_FOUND");
  }

  await db.transaction(async (tx) => {
    await tx.delete(routeBlocks).where(eq(routeBlocks.id, blockId));

    // Renumber remaining blocks in this group
    const remainingBlocks = await tx
      .select({ id: routeBlocks.id })
      .from(routeBlocks)
      .where(eq(routeBlocks.group_id, existing.group_id))
      .orderBy(asc(routeBlocks.position));

    if (remainingBlocks.length > 0) {
      const cases = remainingBlocks
        .map((b, i) => sql`WHEN ${routeBlocks.id} = ${b.id} THEN ${i}`)
        .reduce((acc, c) => sql`${acc} ${c}`);

      await tx
        .update(routeBlocks)
        .set({
          position: sql`CASE ${cases} END`,
        })
        .where(inArray(routeBlocks.id, remainingBlocks.map((b) => b.id)));
    }
  });

  return c.json({ success: true }, 200);
});

// ── Message Bank CRUD ────────────────────────────────────────────────

// GET /admin/message-banks — list all, filterable by type
adminRoutes.get("/admin/message-banks", adminAuth, async (c) => {
  const typeFilter = c.req.query("type");

  const whereClause = typeFilter
    ? eq(messageBanks.type, typeFilter)
    : undefined;

  const rows = await db
    .select()
    .from(messageBanks)
    .where(whereClause)
    .orderBy(asc(messageBanks.type), desc(messageBanks.created_at));

  const response: AdminMessageBankListResponse = {
    message_banks: rows.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      is_active: m.is_active,
      created_at: m.created_at.toISOString(),
      updated_at: m.updated_at.toISOString(),
    })),
  };

  return c.json(response, 200);
});

// POST /admin/message-banks — create a message bank entry
adminRoutes.post("/admin/message-banks", adminAuth, async (c) => {
  const body = await c.req.json();
  const data = messageBankSchema.parse(body);

  const [entry] = await db
    .insert(messageBanks)
    .values({
      type: data.type,
      content: data.content,
      is_active: data.is_active,
    })
    .returning();

  return c.json({
    message_bank: {
      id: entry.id,
      type: entry.type,
      content: entry.content,
      is_active: entry.is_active,
      created_at: entry.created_at.toISOString(),
      updated_at: entry.updated_at.toISOString(),
    },
  }, 201);
});

// PUT /admin/message-banks/:id — update a message bank entry
adminRoutes.put("/admin/message-banks/:id", adminAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = messageBankSchema.parse(body);

  const existing = await db.query.messageBanks.findFirst({
    where: eq(messageBanks.id, id),
  });

  if (!existing) {
    throw new AppError(404, "Message bank entry not found", "MESSAGE_BANK_NOT_FOUND");
  }

  const [updated] = await db
    .update(messageBanks)
    .set({
      type: data.type,
      content: data.content,
      is_active: data.is_active,
      updated_at: new Date(),
    })
    .where(eq(messageBanks.id, id))
    .returning();

  return c.json({
    message_bank: {
      id: updated.id,
      type: updated.type,
      content: updated.content,
      is_active: updated.is_active,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    },
  }, 200);
});

// DELETE /admin/message-banks/:id — delete a message bank entry
adminRoutes.delete("/admin/message-banks/:id", adminAuth, async (c) => {
  const id = c.req.param("id");

  const existing = await db.query.messageBanks.findFirst({
    where: eq(messageBanks.id, id),
  });

  if (!existing) {
    throw new AppError(404, "Message bank entry not found", "MESSAGE_BANK_NOT_FOUND");
  }

  await db.delete(messageBanks).where(eq(messageBanks.id, id));

  return c.json({ success: true }, 200);
});

