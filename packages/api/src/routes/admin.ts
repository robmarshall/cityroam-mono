import { Hono } from "hono";
import { eq, sql, count, desc } from "drizzle-orm";
import { adminLoginSchema } from "@cityroam/shared/validation";
import type { AdminDashboardResponse } from "@cityroam/shared/types";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events } from "../db/schema/index.js";
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
