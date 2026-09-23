import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock db module (chainable pattern) ──────────────────────────────
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
      routeBlocks: { findFirst: vi.fn() },
      routeGroups: { findFirst: vi.fn() },
      routeFamilies: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    groupBy: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
    offset: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    returning: vi.fn(() => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    transaction: vi.fn((fn) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

vi.mock("../redis/index.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  disconnectRedis: vi.fn(),
  setSession: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn(),
  deleteSessionsByEventId: vi.fn(),
  appendMessage: vi.fn(),
  getMessages: vi.fn().mockResolvedValue([]),
  getMessagesSince: vi.fn().mockResolvedValue([]),
  checkJoinRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 20 }),
  publishControl: vi.fn(),
  publishMessage: vi.fn(),
  publishIncoming: vi.fn(),
  publishTyping: vi.fn(),
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  incomingChannel: vi.fn(),
  messagesChannel: vi.fn(),
  typingChannel: vi.fn(),
  controlChannel: vi.fn(),
  extractEventCode: vi.fn(),
  subscribeToIncomingPattern: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
  checkGuideRateLimit: vi.fn(),
  checkParticipantRateLimit: vi.fn(),
}));

vi.mock("../redis/client.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  disconnectRedis: vi.fn(),
}));

vi.mock("../env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_WEBHOOK_SECRET: "whsec_test_fake",
    STRIPE_PRICE_ID: "price_test_fake",
    RESEND_API_KEY: "re_test_fake",
    RESEND_FROM_EMAIL: "test@cityroam.com",
    DEEPSEEK_API_KEY: "dk_test_fake",
    AWS_ACCESS_KEY_ID: "AKIATEST",
    AWS_SECRET_ACCESS_KEY: "secret_test",
    AWS_S3_BUCKET: "test-bucket",
    AWS_REGION: "eu-west-2",
    AWS_CDN_BASE_URL: "https://cdn.test.com",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "admin123",
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    COOKIE_DOMAIN: ".test.com",
    REVIEW_LINK: "https://review.test.com",
    MARKETING_URL: "https://marketing.test.com",
    APP_URL: "https://app.test.com",
    APP_PUBLIC_URL: "https://app.test.com/app",
    ADMIN_URL: "https://admin.test.com",
    BASE_DOMAIN: "test.com",
    NODE_ENV: "development",
    PORT: "3001",
    WS_PORT: "3002",
  },
  validateEnv: vi.fn(),
}));

vi.mock("../services/s3.js", () => ({
  generatePresignedUploadUrl: vi.fn().mockResolvedValue({
    upload_url: "https://s3.test.com/presigned-url",
    key: "uploads/test-file.jpg",
  }),
}));

import { db } from "../db/index.js";
import {
  createTestApp,
  adminRequest,
  fakeUUID,
  resetUUIDs,
  mockEvent,
  mockRoute,
  mockRouteFamily,
  mockRouteBlock,
  futureDate,
} from "./helpers.js";

/** Generate a valid v4 UUID for request bodies that go through Zod validation */
function validUUID(): string {
  return crypto.randomUUID();
}

let app: Hono;

beforeEach(() => {
  resetUUIDs();

  const mockDb = db as any;
  mockDb.select.mockReset().mockImplementation(() => db);
  mockDb.from.mockReset().mockImplementation(() => db);
  mockDb.where.mockReset().mockImplementation(() => db);
  mockDb.groupBy.mockReset().mockImplementation(() => db);
  mockDb.orderBy.mockReset().mockImplementation(() => db);
  mockDb.limit.mockReset().mockImplementation(() => db);
  mockDb.offset.mockReset().mockImplementation(() => db);
  mockDb.insert.mockReset().mockImplementation(() => db);
  mockDb.values.mockReset().mockImplementation(() => db);
  mockDb.returning.mockReset().mockReturnValue([]);
  mockDb.update.mockReset().mockImplementation(() => db);
  mockDb.set.mockReset().mockImplementation(() => db);
  mockDb.delete.mockReset().mockImplementation(() => db);
  mockDb.transaction.mockReset().mockImplementation((fn: any) => fn(db));
  mockDb.execute.mockReset().mockResolvedValue([{ "?column?": 1 }]);

  (db as any).query.events.findFirst.mockReset();
  (db as any).query.participants.findFirst.mockReset();
  (db as any).query.routes.findFirst.mockReset();
  (db as any).query.messageBanks.findFirst.mockReset();
  (db as any).query.routeBlocks.findFirst.mockReset();
  (db as any).query.routeGroups.findFirst.mockReset();
  (db as any).query.routeFamilies.findFirst.mockReset();

  app = createTestApp();
});

// ────────────────────────────────────────────────────────────────────
// POST /admin/events — create a free event
// ────────────────────────────────────────────────────────────────────

describe("POST /admin/events", () => {
  it("creates a free event for a valid route", async () => {
    const routeId = validUUID();
    const route = mockRoute({ id: routeId, route_family_id: fakeUUID(), language: "en" });
    (db as any).query.routes.findFirst.mockResolvedValueOnce(route);

    // Code collision check: no conflict
    (db as any).query.events.findFirst.mockResolvedValueOnce(null);

    // Insert returning
    const created = mockEvent({ route_id: routeId, route_family_id: route.route_family_id });
    (db as any).returning.mockReturnValueOnce([created]);

    const res = await adminRequest(app, "POST", "/admin/events", {
      route_id: routeId,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.event.route_id).toBe(routeId);
  });

  it("returns 404 when route does not exist", async () => {
    const routeId = validUUID();
    (db as any).query.routes.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "POST", "/admin/events", {
      route_id: routeId,
    });
    expect(res.status).toBe(404);
  });

  it("returns 500 when all code generation attempts collide", async () => {
    const routeId = validUUID();
    const route = mockRoute({ id: routeId });
    (db as any).query.routes.findFirst.mockResolvedValueOnce(route);

    // All 5 code attempts hit existing events
    (db as any).query.events.findFirst
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce({ id: "existing" });

    const res = await adminRequest(app, "POST", "/admin/events", {
      route_id: routeId,
    });
    expect(res.status).toBe(500);
  });
});

// ────────────────────────────────────────────────────────────────────
// POST /admin/events/:id/refund
// ────────────────────────────────────────────────────────────────────

describe("POST /admin/events/:id/refund", () => {
  it("returns 404 when event does not exist", async () => {
    (db as any).query.events.findFirst.mockResolvedValueOnce(null);
    const res = await adminRequest(app, "POST", `/admin/events/${fakeUUID()}/refund`);
    expect(res.status).toBe(404);
  });

  it("returns 409 when event is already refunded", async () => {
    const event = mockEvent({ status: "REFUNDED" });
    (db as any).query.events.findFirst.mockResolvedValueOnce(event);

    const res = await adminRequest(app, "POST", `/admin/events/${event.id}/refund`);
    expect(res.status).toBe(409);
  });

  it("returns 400 when event has no stripe payment", async () => {
    const event = mockEvent({ stripe_payment_id: null });
    (db as any).query.events.findFirst.mockResolvedValueOnce(event);

    const res = await adminRequest(app, "POST", `/admin/events/${event.id}/refund`);
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────
// Route Family CRUD
// ────────────────────────────────────────────────────────────────────

describe("GET /admin/route-families", () => {
  it("returns list of route families with routes", async () => {
    const family = mockRouteFamily();

    // First orderBy: family list
    (db as any).orderBy.mockResolvedValueOnce([family]);
    // Second where: routes for families
    (db as any).where.mockResolvedValueOnce([
      { id: "r1", language: "en", name: "English Route", is_active: true, route_family_id: family.id },
    ]);

    const res = await adminRequest(app, "GET", "/admin/route-families");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route_families).toHaveLength(1);
    expect(body.route_families[0].routes).toHaveLength(1);
  });

  it("returns empty list when no families exist", async () => {
    (db as any).orderBy.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "GET", "/admin/route-families");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route_families).toHaveLength(0);
  });
});

describe("GET /admin/route-families/:id", () => {
  it("returns route family detail with routes", async () => {
    const family = mockRouteFamily();
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(family);

    const route = mockRoute({ route_family_id: family.id });
    // Routes for family
    (db as any).orderBy.mockResolvedValueOnce([route]);
    // Group counts
    (db as any).groupBy.mockResolvedValueOnce([{ route_id: route.id, count: 3 }]);

    const res = await adminRequest(app, "GET", `/admin/route-families/${family.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route_family.id).toBe(family.id);
    expect(body.routes).toHaveLength(1);
    expect(body.routes[0].group_count).toBe(3);
  });

  it("returns 404 when family does not exist", async () => {
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "GET", `/admin/route-families/${fakeUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /admin/route-families", () => {
  it("creates a route family", async () => {
    const created = mockRouteFamily({ name: "Amsterdam", city: "Amsterdam" });
    (db as any).returning.mockReturnValueOnce([created]);

    const res = await adminRequest(app, "POST", "/admin/route-families", {
      name: "Amsterdam",
      city: "Amsterdam",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.route_family.name).toBe("Amsterdam");
  });

  it("returns 400 for missing name", async () => {
    const res = await adminRequest(app, "POST", "/admin/route-families", {
      city: "Amsterdam",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing city", async () => {
    const res = await adminRequest(app, "POST", "/admin/route-families", {
      name: "Amsterdam",
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /admin/route-families/:id", () => {
  it("updates a route family", async () => {
    const family = mockRouteFamily();
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(family);

    const updated = { ...family, name: "Updated Name" };
    (db as any).returning.mockReturnValueOnce([updated]);

    const res = await adminRequest(app, "PUT", `/admin/route-families/${family.id}`, {
      name: "Updated Name",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route_family.name).toBe("Updated Name");
  });

  it("returns 404 when family does not exist", async () => {
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "PUT", `/admin/route-families/${fakeUUID()}`, {
      name: "Updated",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty name", async () => {
    const family = mockRouteFamily();
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(family);

    const res = await adminRequest(app, "PUT", `/admin/route-families/${family.id}`, {
      name: "",
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /admin/route-families/:id", () => {
  it("deletes a route family with no routes", async () => {
    const family = mockRouteFamily();
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(family);

    // No routes reference this family
    (db as any).limit.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "DELETE", `/admin/route-families/${family.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 409 when family has routes", async () => {
    const family = mockRouteFamily();
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(family);

    // Routes exist
    (db as any).limit.mockResolvedValueOnce([{ id: "route-1" }]);

    const res = await adminRequest(app, "DELETE", `/admin/route-families/${family.id}`);
    expect(res.status).toBe(409);
  });

  it("returns 404 when family does not exist", async () => {
    (db as any).query.routeFamilies.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "DELETE", `/admin/route-families/${fakeUUID()}`);
    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────────
// PUT /admin/blocks/:blockId/move
// ────────────────────────────────────────────────────────────────────

describe("PUT /admin/blocks/:blockId/move", () => {
  it("moves a block to a target group", async () => {
    const block = mockRouteBlock({ group_id: fakeUUID() });
    (db as any).query.routeBlocks.findFirst
      .mockResolvedValueOnce(block)   // existing block lookup
      .mockResolvedValueOnce(block);  // final result after move

    const targetGroupId = validUUID();
    const targetGroup = { id: targetGroupId };
    (db as any).query.routeGroups.findFirst.mockResolvedValueOnce(targetGroup);

    // Live-event guard across the source and target groups: none playing
    (db as any).where.mockResolvedValueOnce([{ count: 0 }]);

    // Source group remaining blocks (after removing moved block)
    (db as any).orderBy
      .mockResolvedValueOnce([])       // remaining in source group
      .mockResolvedValueOnce([]);      // blocks in target group

    const res = await adminRequest(app, "PUT", `/admin/blocks/${block.id}/move`, {
      target_group_id: targetGroupId,
      position: 0,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.block).toBeDefined();
  });

  it("returns 409 when a live event is in the source or target group", async () => {
    const block = mockRouteBlock({ group_id: fakeUUID() });
    (db as any).query.routeBlocks.findFirst.mockResolvedValueOnce(block);

    const targetGroupId = validUUID();
    (db as any).query.routeGroups.findFirst.mockResolvedValueOnce({ id: targetGroupId });

    // A move renumbers both groups, stranding a live current_block_index.
    (db as any).where.mockResolvedValueOnce([{ count: 1 }]);

    const res = await adminRequest(app, "PUT", `/admin/blocks/${block.id}/move`, {
      target_group_id: targetGroupId,
      position: 0,
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("BLOCK_HAS_LIVE_EVENTS");
  });

  it("returns 404 when block does not exist", async () => {
    (db as any).query.routeBlocks.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "PUT", `/admin/blocks/${fakeUUID()}/move`, {
      target_group_id: validUUID(),
      position: 0,
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when target group does not exist", async () => {
    const block = mockRouteBlock();
    (db as any).query.routeBlocks.findFirst.mockResolvedValueOnce(block);
    (db as any).query.routeGroups.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "PUT", `/admin/blocks/${block.id}/move`, {
      target_group_id: validUUID(),
      position: 0,
    });
    expect(res.status).toBe(404);
  });
});
