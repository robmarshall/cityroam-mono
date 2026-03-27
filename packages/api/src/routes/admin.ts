import { Hono } from "hono";
import { eq, sql, count, desc, and, asc } from "drizzle-orm";
import { adminLoginSchema, adminUpdateEventStatusSchema } from "@cityroam/shared/validation";
import type { AdminDashboardResponse, AdminEventListResponse, AdminEventDetailResponse } from "@cityroam/shared/types";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, participants, messages } from "../db/schema/index.js";
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
      .where(sql`${participants.event_id} IN ${eventIds}`)
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
