import { Hono } from "hono";
import { eq, sql, count, desc, and, asc, inArray } from "drizzle-orm";
import { adminLoginSchema, adminUpdateEventStatusSchema, routeSchema, stopSchema, stopReorderSchema, imageUploadRequestSchema } from "@cityroam/shared/validation";
import { generatePresignedUploadUrl } from "../services/s3.js";
import type { AdminDashboardResponse, AdminEventListResponse, AdminEventDetailResponse, AdminRouteDetailResponse, AdminRouteListResponse } from "@cityroam/shared/types";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, participants, messages, routes, stops } from "../db/schema/index.js";
import { AppError } from "../middleware/error-handler.js";
import { adminAuth, signAdminToken } from "../middleware/admin.js";

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
    })),
    total,
    page,
    per_page,
  };

  return c.json(response, 200);
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
    },
    participants: eventParticipants.map((p) => ({
      id: p.id,
      event_id: p.event_id,
      display_name: p.display_name,
      token: p.token,
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
  const { status } = adminUpdateEventStatusSchema.parse(body);

  const existing = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!existing) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  await db
    .update(events)
    .set({ status })
    .where(eq(events.id, id));

  return c.json({ success: true, status }, 200);
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

  // Use a generic upload path (route/stop association happens when the stop is updated)
  const key = `uploads/${uniqueFilename}`;

  const result = await generatePresignedUploadUrl(key, content_type);
  return c.json(result, 200);
});

// ── Route CRUD ──────────────────────────────────────────────────────

// GET /admin/routes — list all routes with stop counts
adminRoutes.get("/admin/routes", adminAuth, async (c) => {
  const routeRows = await db
    .select()
    .from(routes)
    .orderBy(desc(routes.created_at));

  // Get stop counts per route
  const routeIds = routeRows.map((r) => r.id);
  let stopCounts: Record<string, number> = {};
  if (routeIds.length > 0) {
    const countRows = await db
      .select({
        route_id: stops.route_id,
        count: count(),
      })
      .from(stops)
      .where(inArray(stops.route_id, routeIds))
      .groupBy(stops.route_id);

    for (const row of countRows) {
      stopCounts[row.route_id] = Number(row.count);
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
      stop_count: stopCounts[r.id] ?? 0,
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

// GET /admin/routes/:id — route detail with stops
adminRoutes.get("/admin/routes/:id", adminAuth, async (c) => {
  const id = c.req.param("id");

  const route = await db.query.routes.findFirst({
    where: eq(routes.id, id),
  });

  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  const routeStops = await db
    .select()
    .from(stops)
    .where(eq(stops.route_id, id))
    .orderBy(asc(stops.stop_number));

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
    stops: routeStops.map((s) => ({
      id: s.id,
      route_id: s.route_id,
      stop_number: s.stop_number,
      name: s.name,
      directions_from_previous: s.directions_from_previous,
      clue: s.clue,
      accepted_answers: s.accepted_answers as string[],
      hints: s.hints as string[],
      correct_response: s.correct_response ?? "",
      fun_fact: s.fun_fact,
      images: (s.images as string[]) ?? [],
      google_maps_link: s.google_maps_link ?? "",
      created_at: s.created_at.toISOString(),
      updated_at: s.updated_at.toISOString(),
    })),
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

    await tx.delete(stops).where(eq(stops.route_id, id));
    await tx.delete(routes).where(eq(routes.id, id));
  });

  return c.json({ success: true }, 200);
});

// ── Stop CRUD ───────────────────────────────────────────────────────

// POST /admin/routes/:id/stops — create a stop for a route
adminRoutes.post("/admin/routes/:id/stops", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const body = await c.req.json();
  const data = stopSchema.parse(body);

  const route = await db.query.routes.findFirst({
    where: eq(routes.id, routeId),
  });

  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  // Determine next stop_number
  const maxStopResult = await db
    .select({ max: sql<number>`COALESCE(MAX(${stops.stop_number}), 0)` })
    .from(stops)
    .where(eq(stops.route_id, routeId));
  const nextStopNumber = Number(maxStopResult[0]?.max ?? 0) + 1;

  const [stop] = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(stops)
      .values({
        route_id: routeId,
        stop_number: nextStopNumber,
        name: data.name,
        directions_from_previous: data.directions_from_previous ?? "",
        clue: data.clue,
        accepted_answers: data.accepted_answers,
        hints: data.hints,
        correct_response: data.correct_response ?? null,
        fun_fact: data.fun_fact ?? "",
        images: data.images,
        google_maps_link: data.google_maps_link || null,
      })
      .returning();

    await tx
      .update(routes)
      .set({
        total_stops: nextStopNumber,
        updated_at: new Date(),
      })
      .where(eq(routes.id, routeId));

    return [inserted];
  });

  return c.json({
    stop: {
      id: stop.id,
      route_id: stop.route_id,
      stop_number: stop.stop_number,
      name: stop.name,
      directions_from_previous: stop.directions_from_previous,
      clue: stop.clue,
      accepted_answers: stop.accepted_answers as string[],
      hints: stop.hints as string[],
      correct_response: stop.correct_response ?? "",
      fun_fact: stop.fun_fact,
      images: (stop.images as string[]) ?? [],
      google_maps_link: stop.google_maps_link ?? "",
      created_at: stop.created_at.toISOString(),
      updated_at: stop.updated_at.toISOString(),
    },
  }, 201);
});

// PUT /admin/routes/:id/stops/reorder — reorder stops (must be before :stopId routes)
adminRoutes.put("/admin/routes/:id/stops/reorder", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const body = await c.req.json();
  const { stop_ids } = stopReorderSchema.parse(body);

  const route = await db.query.routes.findFirst({
    where: eq(routes.id, routeId),
  });

  if (!route) {
    throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
  }

  // Check for duplicate stop IDs
  if (new Set(stop_ids).size !== stop_ids.length) {
    throw new AppError(400, "Duplicate stop IDs", "DUPLICATE_STOP_IDS");
  }

  // Verify all stop_ids belong to this route
  const routeStops = await db
    .select({ id: stops.id })
    .from(stops)
    .where(eq(stops.route_id, routeId));

  const routeStopIds = new Set(routeStops.map((s) => s.id));

  for (const stopId of stop_ids) {
    if (!routeStopIds.has(stopId)) {
      throw new AppError(400, `Stop ${stopId} does not belong to this route`, "INVALID_STOP_ID");
    }
  }

  if (stop_ids.length !== routeStops.length) {
    throw new AppError(400, "All stops must be included in the reorder", "INCOMPLETE_STOP_LIST");
  }

  // Update stop_numbers atomically using a CASE expression to avoid
  // unique constraint violations when stops swap positions
  await db.transaction(async (tx) => {
    const now = new Date();
    const cases = stop_ids
      .map((id, i) => sql`WHEN ${stops.id} = ${id} THEN ${i + 1}`)
      .reduce((acc, c) => sql`${acc} ${c}`);

    await tx
      .update(stops)
      .set({
        stop_number: sql`CASE ${cases} END`,
        updated_at: now,
      })
      .where(inArray(stops.id, stop_ids));
  });

  return c.json({ success: true }, 200);
});

// PUT /admin/routes/:id/stops/:stopId — update a stop
adminRoutes.put("/admin/routes/:id/stops/:stopId", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const stopId = c.req.param("stopId");
  const body = await c.req.json();
  const data = stopSchema.parse(body);

  const existing = await db.query.stops.findFirst({
    where: and(eq(stops.id, stopId), eq(stops.route_id, routeId)),
  });

  if (!existing) {
    throw new AppError(404, "Stop not found", "STOP_NOT_FOUND");
  }

  const [updated] = await db
    .update(stops)
    .set({
      name: data.name,
      directions_from_previous: data.directions_from_previous ?? "",
      clue: data.clue,
      accepted_answers: data.accepted_answers,
      hints: data.hints,
      correct_response: data.correct_response ?? null,
      fun_fact: data.fun_fact ?? "",
      images: data.images,
      google_maps_link: data.google_maps_link || null,
      updated_at: new Date(),
    })
    .where(eq(stops.id, stopId))
    .returning();

  return c.json({
    stop: {
      id: updated.id,
      route_id: updated.route_id,
      stop_number: updated.stop_number,
      name: updated.name,
      directions_from_previous: updated.directions_from_previous,
      clue: updated.clue,
      accepted_answers: updated.accepted_answers as string[],
      hints: updated.hints as string[],
      correct_response: updated.correct_response ?? "",
      fun_fact: updated.fun_fact,
      images: (updated.images as string[]) ?? [],
      google_maps_link: updated.google_maps_link ?? "",
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    },
  }, 200);
});

// DELETE /admin/routes/:id/stops/:stopId — delete a stop and renumber
adminRoutes.delete("/admin/routes/:id/stops/:stopId", adminAuth, async (c) => {
  const routeId = c.req.param("id");
  const stopId = c.req.param("stopId");

  const existing = await db.query.stops.findFirst({
    where: and(eq(stops.id, stopId), eq(stops.route_id, routeId)),
  });

  if (!existing) {
    throw new AppError(404, "Stop not found", "STOP_NOT_FOUND");
  }

  await db.transaction(async (tx) => {
    const now = new Date();

    // Delete the stop
    await tx.delete(stops).where(eq(stops.id, stopId));

    // Renumber remaining stops
    const remainingStops = await tx
      .select({ id: stops.id })
      .from(stops)
      .where(eq(stops.route_id, routeId))
      .orderBy(asc(stops.stop_number));

    if (remainingStops.length > 0) {
      const cases = remainingStops
        .map((s, i) => sql`WHEN ${stops.id} = ${s.id} THEN ${i + 1}`)
        .reduce((acc, c) => sql`${acc} ${c}`);

      await tx
        .update(stops)
        .set({
          stop_number: sql`CASE ${cases} END`,
          updated_at: now,
        })
        .where(inArray(stops.id, remainingStops.map((s) => s.id)));
    }

    // Update route total_stops
    await tx
      .update(routes)
      .set({
        total_stops: remainingStops.length,
        updated_at: now,
      })
      .where(eq(routes.id, routeId));
  });

  return c.json({ success: true }, 200);
});

