import { vi } from "vitest";
import { Hono } from "hono";
import {
  createCorsMiddleware,
  requestLogger,
  errorHandler,
} from "../middleware/index.js";
import { eventRoutes } from "../routes/events.js";
import { checkoutRoutes } from "../routes/checkout.js";
import { adminRoutes } from "../routes/admin.js";
import { signAdminToken } from "../middleware/admin.js";
import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { sql } from "drizzle-orm";

/**
 * Builds a test Hono app identical to the production HTTP app
 * but without starting a server or starting the expiry sweep.
 */
export function createTestApp(): Hono {
  const app = new Hono();

  // Global middleware
  app.use("*", createCorsMiddleware());
  app.use("*", requestLogger);
  app.onError(errorHandler);

  // Health check
  app.get("/health", async (c) => {
    const checks = { db: "ok" as string, redis: "ok" as string };
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      checks.db = "error";
    }
    try {
      await redis.ping();
    } catch {
      checks.redis = "error";
    }
    const healthy = checks.db === "ok" && checks.redis === "ok";
    return c.json(
      { status: healthy ? "ok" : "degraded", ...checks },
      healthy ? 200 : 503,
    );
  });

  // Routes
  app.route("/", eventRoutes);
  app.route("/", checkoutRoutes);
  app.route("/", adminRoutes);

  return app;
}

/**
 * Helper to get a valid admin JWT for test requests.
 */
export async function getAdminToken(): Promise<string> {
  return signAdminToken("admin");
}

/**
 * Helper to make a JSON request to the test app.
 */
export function jsonRequest(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return Promise.resolve(app.request(path, init));
}

/**
 * Helper to make a request with admin auth.
 */
export async function adminRequest(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = await getAdminToken();
  return jsonRequest(app, method, path, body, {
    Authorization: `Bearer ${token}`,
  });
}

// ── UUID helpers ────────────────────────────────────────────────────

let uuidCounter = 0;
export function fakeUUID(): string {
  uuidCounter++;
  return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, "0")}`;
}

export function resetUUIDs(): void {
  uuidCounter = 0;
}

// ── Timestamp helpers ───────────────────────────────────────────────

export function futureDate(days = 90): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function pastDate(days = 1): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ── Mock event factory ──────────────────────────────────────────────

export function mockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    code: "ABCD1234",
    status: "NOT_STARTED",
    route_id: fakeUUID(),
    stripe_session_id: "cs_test_123",
    stripe_payment_id: "pi_test_123",
    buyer_email: "test@example.com",
    current_stop: 0,
    hints_given: 0,
    wrong_attempts: 0,
    guide_response_count: 0,
    lead_participant_id: null,
    current_group_id: null,
    current_block_id: null,
    created_at: new Date(),
    started_at: null,
    completed_at: null,
    expires_at: futureDate(),
    ...overrides,
  };
}

export function mockParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    event_id: fakeUUID(),
    display_name: "TestUser",
    token: crypto.randomUUID(),
    is_lead: false,
    is_active: true,
    joined_at: new Date(),
    last_seen_at: new Date(),
    left_at: null,
    left_reason: null,
    ...overrides,
  };
}

export function mockRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    city: "Leeds",
    name: "Test Route",
    description: "A test route",
    total_stops: 3,
    estimated_duration_mins: 60,
    estimated_distance_km: "2.5",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function mockStop(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    route_id: fakeUUID(),
    stop_number: 1,
    name: "Test Stop",
    directions_from_previous: "Walk straight ahead",
    clue: "Find the big building",
    accepted_answers: ["town hall", "the town hall"],
    hints: ["It has columns", "Look for the clock"],
    correct_response: "Well done!",
    fun_fact: "Built in 1858",
    images: [],
    google_maps_link: "https://maps.google.com/test",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function mockRouteGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    route_id: fakeUUID(),
    position: 0,
    name: "Test Group",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function mockRouteBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    group_id: fakeUUID(),
    position: 0,
    type: "message",
    config: { type: "message", content: "Test message" },
    delay_ms: 0,
    created_at: new Date(),
    ...overrides,
  };
}

export function mockQuestionBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    group_id: fakeUUID(),
    position: 0,
    type: "question",
    config: {
      type: "question",
      clue: "Find the big building",
      accepted_answers: ["town hall", "the town hall"],
      hints: [
        [{ content: "It has columns", image_url: null, delay_ms: 0 }],
        [{ content: "Look for the clock", image_url: null, delay_ms: 0 }],
      ],
    },
    delay_ms: 0,
    created_at: new Date(),
    ...overrides,
  };
}

export function mockMessageBank(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    type: "success",
    content: "Great job!",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function mockMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUUID(),
    event_id: fakeUUID(),
    step_number: 1,
    sender_type: "guide",
    sender_name: "Guide",
    participant_id: null,
    content: "Hello!",
    image_url: null,
    created_at: new Date(),
    ...overrides,
  };
}
