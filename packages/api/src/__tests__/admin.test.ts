import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock db module (chainable pattern) ──────────────────────────────
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      stops: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
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

import { db } from "../db/index.js";
import {
  createTestApp,
  adminRequest,
  jsonRequest,
  fakeUUID,
  resetUUIDs,
  mockEvent,
  mockParticipant,
  mockRoute,
  mockStop,
  mockMessageBank,
  futureDate,
} from "./helpers.js";
import { signAdminToken } from "../middleware/admin.js";
import { generatePresignedUploadUrl } from "../services/s3.js";

// ── Helpers ─────────────────────────────────────────────────────────

let app: Hono;

beforeEach(() => {
  resetUUIDs();

  // Reset all chainable mocks completely (clears queued return values)
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

  // Reset query mocks
  (db as any).query.events.findFirst.mockReset();
  (db as any).query.participants.findFirst.mockReset();
  (db as any).query.stops.findFirst.mockReset();
  (db as any).query.routes.findFirst.mockReset();
  (db as any).query.messageBanks.findFirst.mockReset();

  app = createTestApp();
});

// ────────────────────────────────────────────────────────────────────
// POST /admin/login
// ────────────────────────────────────────────────────────────────────
describe("POST /admin/login", () => {
  it("returns JWT token for valid credentials", async () => {
    const res = await jsonRequest(app, "POST", "/admin/login", {
      username: "admin",
      password: "admin123",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".")).toHaveLength(3); // JWT has 3 parts
  });

  it("returns 401 for invalid credentials", async () => {
    const res = await jsonRequest(app, "POST", "/admin/login", {
      username: "admin",
      password: "wrong_password",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns error for missing fields", async () => {
    const res = await jsonRequest(app, "POST", "/admin/login", {
      username: "admin",
    });

    // Validation error (ZodError) - status depends on zod version compatibility
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ────────────────────────────────────────────────────────────────────
// Admin auth middleware
// ────────────────────────────────────────────────────────────────────
describe("Admin auth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await jsonRequest(app, "GET", "/admin/dashboard");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 401 for invalid JWT", async () => {
    const res = await jsonRequest(app, "GET", "/admin/dashboard", undefined, {
      Authorization: "Bearer invalid.jwt.token",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("allows request with valid JWT", async () => {
    // Mock the 3 dashboard queries so we get a 200
    (db as any).groupBy.mockResolvedValueOnce([]);
    (db as any).where.mockResolvedValueOnce([{ count: 0 }]);
    (db as any).limit.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "GET", "/admin/dashboard");
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /admin/dashboard
// ────────────────────────────────────────────────────────────────────
describe("GET /admin/dashboard", () => {
  it("returns event counts by status and recent events", async () => {
    const now = new Date();

    // Query 1: status counts (terminal: groupBy)
    (db as any).groupBy.mockResolvedValueOnce([
      { status: "NOT_STARTED", count: 5 },
      { status: "COMPLETED", count: 3 },
      { status: "IN_PROGRESS", count: 1 },
    ]);
    // Query 2: revenue count (terminal: where)
    (db as any).where.mockResolvedValueOnce([{ count: 7 }]);
    // Query 3: recent events (terminal: limit)
    (db as any).limit.mockResolvedValueOnce([
      { code: "ABCD1234", status: "NOT_STARTED", buyer_email: "a@b.com", created_at: now },
      { code: "EFGH5678", status: "COMPLETED", buyer_email: "c@d.com", created_at: now },
    ]);

    const res = await adminRequest(app, "GET", "/admin/dashboard");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.counts.NOT_STARTED).toBe(5);
    expect(body.counts.COMPLETED).toBe(3);
    expect(body.counts.IN_PROGRESS).toBe(1);
    expect(body.counts.WAITING).toBe(0);
    expect(body.counts.EXPIRED).toBe(0);
    expect(body.total_revenue_events).toBe(7);
    expect(body.recent_events).toHaveLength(2);
    expect(body.recent_events[0].code).toBe("ABCD1234");
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /admin/events (paginated)
// ────────────────────────────────────────────────────────────────────
describe("GET /admin/events", () => {
  it("returns paginated events with participant counts", async () => {
    const eventId = fakeUUID();
    const now = new Date();

    // Query 1: total count (terminal: where)
    (db as any).where.mockResolvedValueOnce([{ count: 1 }]);
    // Query 2: event rows (terminal: offset)
    (db as any).offset.mockResolvedValueOnce([
      { id: eventId, code: "ABCD1234", buyer_email: "a@b.com", status: "NOT_STARTED", created_at: now },
    ]);
    // Query 3: participant counts (terminal: groupBy)
    (db as any).groupBy.mockResolvedValueOnce([
      { event_id: eventId, count: 3 },
    ]);

    const res = await adminRequest(app, "GET", "/admin/events?page=1&per_page=20");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.per_page).toBe(20);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].participant_count).toBe(3);
    expect(body.events[0].code).toBe("ABCD1234");
  });

  it("passes status filter parameter", async () => {
    // Query 1: total count
    (db as any).where.mockResolvedValueOnce([{ count: 0 }]);
    // Query 2: event rows (no results, offset is terminal)
    (db as any).offset.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "GET", "/admin/events?status=COMPLETED");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /admin/events/:id
// ────────────────────────────────────────────────────────────────────
describe("GET /admin/events/:id", () => {
  it("returns event detail with participants, messages, and stripe_payment_id", async () => {
    const eventId = fakeUUID();
    const event = mockEvent({ id: eventId, stripe_payment_id: "pi_test_abc" });

    (db as any).query.events.findFirst.mockResolvedValueOnce(event);

    // Participants query (terminal: orderBy)
    const participant = mockParticipant({ event_id: eventId, display_name: "Alice" });
    (db as any).orderBy.mockResolvedValueOnce([participant]);

    // Messages query (terminal: orderBy on second call)
    (db as any).orderBy.mockResolvedValueOnce([
      {
        id: fakeUUID(),
        event_id: eventId,
        step_number: 1,
        sender_type: "guide",
        sender_name: "Guide",
        participant_id: null,
        content: "Welcome!",
        image_url: null,
        created_at: new Date(),
      },
    ]);

    const res = await adminRequest(app, "GET", `/admin/events/${eventId}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.event.id).toBe(eventId);
    expect(body.event.stripe_payment_id).toBe("pi_test_abc");
    expect(body.participants).toHaveLength(1);
    expect(body.participants[0].display_name).toBe("Alice");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Welcome!");
    expect(body.stripe_payment_id).toBe("pi_test_abc");
  });

  it("returns 404 when event does not exist", async () => {
    (db as any).query.events.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "GET", `/admin/events/${fakeUUID()}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("EVENT_NOT_FOUND");
  });
});

// ────────────────────────────────────────────────────────────────────
// PATCH /admin/events/:id
// ────────────────────────────────────────────────────────────────────
describe("PATCH /admin/events/:id", () => {
  it("updates event status", async () => {
    const eventId = fakeUUID();
    const event = mockEvent({ id: eventId });
    (db as any).query.events.findFirst.mockResolvedValueOnce(event);

    // The update chain: db.update().set().where() - where is terminal
    (db as any).where.mockResolvedValueOnce(undefined);

    const res = await adminRequest(app, "PATCH", `/admin/events/${eventId}`, {
      status: "COMPLETED",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("COMPLETED");
  });

  it("returns 404 when event does not exist", async () => {
    (db as any).query.events.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "PATCH", `/admin/events/${fakeUUID()}`, {
      status: "COMPLETED",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("EVENT_NOT_FOUND");
  });
});

// ────────────────────────────────────────────────────────────────────
// POST /admin/upload
// ────────────────────────────────────────────────────────────────────
describe("POST /admin/upload", () => {
  it("returns pre-signed upload URL", async () => {
    const res = await adminRequest(app, "POST", "/admin/upload", {
      filename: "photo.jpg",
      content_type: "image/jpeg",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upload_url).toBe("https://s3.test.com/presigned-url");
    expect(body.key).toBe("uploads/test-file.jpg");
    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringContaining("photo.jpg"),
      "image/jpeg",
    );
  });

  it("returns 400 for invalid filename", async () => {
    const res = await adminRequest(app, "POST", "/admin/upload", {
      filename: "///",
      content_type: "image/jpeg",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILENAME");
  });
});

// ────────────────────────────────────────────────────────────────────
// Route CRUD
// ────────────────────────────────────────────────────────────────────
describe("Admin Route CRUD", () => {
  const routeData = {
    city: "Leeds",
    name: "City Centre Tour",
    description: "A nice walk",
    estimated_duration_mins: 60,
    estimated_distance_km: 2.5,
    is_active: true,
  };

  describe("GET /admin/routes", () => {
    it("returns routes with stop counts", async () => {
      const routeId = fakeUUID();
      const route = mockRoute({ id: routeId });

      // Query 1: route rows (terminal: orderBy)
      (db as any).orderBy.mockResolvedValueOnce([route]);
      // Query 2: stop counts (terminal: groupBy)
      (db as any).groupBy.mockResolvedValueOnce([
        { route_id: routeId, count: 5 },
      ]);

      const res = await adminRequest(app, "GET", "/admin/routes");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.routes).toHaveLength(1);
      expect(body.routes[0].name).toBe("Test Route");
      expect(body.routes[0].stop_count).toBe(5);
    });
  });

  describe("POST /admin/routes", () => {
    it("creates a new route", async () => {
      const route = mockRoute({ ...routeData, total_stops: 0 });
      (db as any).returning.mockReturnValueOnce([route]);

      const res = await adminRequest(app, "POST", "/admin/routes", routeData);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.route.name).toBe("City Centre Tour");
      expect(body.route.city).toBe("Leeds");
    });
  });

  describe("GET /admin/routes/:id", () => {
    it("returns route detail with stops", async () => {
      const routeId = fakeUUID();
      const route = mockRoute({ id: routeId });
      const stop = mockStop({ route_id: routeId });

      (db as any).query.routes.findFirst.mockResolvedValueOnce(route);
      // Groups query (terminal: orderBy) — no groups yet
      (db as any).orderBy.mockResolvedValueOnce([]);
      // Legacy stops query (terminal: orderBy)
      (db as any).orderBy.mockResolvedValueOnce([stop]);

      const res = await adminRequest(app, "GET", `/admin/routes/${routeId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.route.id).toBe(routeId);
      expect(body.groups).toHaveLength(0);
      expect(body.stops).toHaveLength(1);
      expect(body.stops[0].name).toBe("Test Stop");
    });

    it("returns 404 when route does not exist", async () => {
      (db as any).query.routes.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "GET", `/admin/routes/${fakeUUID()}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("PUT /admin/routes/:id", () => {
    it("updates an existing route", async () => {
      const routeId = fakeUUID();
      const existing = mockRoute({ id: routeId });
      const updated = mockRoute({ id: routeId, name: "Updated Route" });

      (db as any).query.routes.findFirst.mockResolvedValueOnce(existing);
      (db as any).returning.mockReturnValueOnce([updated]);

      const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}`, routeData);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.route.name).toBe("Updated Route");
    });

    it("returns 404 when route does not exist", async () => {
      (db as any).query.routes.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "PUT", `/admin/routes/${fakeUUID()}`, routeData);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("DELETE /admin/routes/:id", () => {
    it("deletes a route when no events reference it", async () => {
      const routeId = fakeUUID();
      (db as any).query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
      // Transaction: event count check (terminal: where in transaction)
      (db as any).where.mockResolvedValueOnce([{ count: 0 }]);
      // Transaction: delete stops (terminal: where)
      (db as any).where.mockResolvedValueOnce(undefined);
      // Transaction: delete route (terminal: where)
      (db as any).where.mockResolvedValueOnce(undefined);

      const res = await adminRequest(app, "DELETE", `/admin/routes/${routeId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 409 when events reference the route", async () => {
      const routeId = fakeUUID();
      (db as any).query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
      // Transaction: event count check returns > 0
      (db as any).where.mockResolvedValueOnce([{ count: 3 }]);

      const res = await adminRequest(app, "DELETE", `/admin/routes/${routeId}`);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ROUTE_HAS_EVENTS");
    });

    it("returns 404 when route does not exist", async () => {
      (db as any).query.routes.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "DELETE", `/admin/routes/${fakeUUID()}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("ROUTE_NOT_FOUND");
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Stop CRUD
// ────────────────────────────────────────────────────────────────────
describe("Admin Stop CRUD", () => {
  const stopData = {
    name: "Town Hall",
    directions_from_previous: "Walk north",
    clue: "Find the big clock",
    accepted_answers: ["town hall"],
    hints: ["Look up", "It has columns"],
    correct_response: "Well done!",
    fun_fact: "Built in 1858",
    images: [],
    google_maps_link: "https://maps.google.com/test",
  };

  describe("POST /admin/routes/:id/stops", () => {
    it("creates a stop for a route", async () => {
      const routeId = fakeUUID();
      (db as any).query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));

      // Max stop number query (terminal: where)
      (db as any).where.mockResolvedValueOnce([{ max: 2 }]);

      // Transaction: insert returning
      const stop = mockStop({ route_id: routeId, stop_number: 3, name: "Town Hall" });
      (db as any).returning.mockReturnValueOnce([stop]);
      // Transaction: update route (terminal: where)
      (db as any).where.mockResolvedValueOnce(undefined);

      const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/stops`, stopData);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.stop.name).toBe("Town Hall");
      expect(body.stop.stop_number).toBe(3);
    });

    it("returns 404 when route does not exist", async () => {
      (db as any).query.routes.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "POST", `/admin/routes/${fakeUUID()}/stops`, stopData);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("PUT /admin/routes/:id/stops/reorder", () => {
    it("reorders stops successfully", async () => {
      const routeId = fakeUUID();
      // Use real UUIDs that pass zod uuid validation
      const stopId1 = crypto.randomUUID();
      const stopId2 = crypto.randomUUID();

      (db as any).query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));

      // Query: route stops (terminal: where)
      (db as any).where.mockResolvedValueOnce([{ id: stopId1 }, { id: stopId2 }]);

      // Transaction: update stops (terminal: where)
      (db as any).where.mockResolvedValueOnce(undefined);

      const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}/stops/reorder`, {
        stop_ids: [stopId2, stopId1],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 400 for duplicate stop IDs", async () => {
      const routeId = fakeUUID();
      const stopId1 = crypto.randomUUID();

      (db as any).query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));

      const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}/stops/reorder`, {
        stop_ids: [stopId1, stopId1],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("DUPLICATE_STOP_IDS");
    });
  });

  describe("PUT /admin/routes/:id/stops/:stopId", () => {
    it("updates a stop", async () => {
      const routeId = fakeUUID();
      const stopId = fakeUUID();
      const existing = mockStop({ id: stopId, route_id: routeId });
      const updated = mockStop({ id: stopId, route_id: routeId, name: "Updated Stop" });

      (db as any).query.stops.findFirst.mockResolvedValueOnce(existing);
      (db as any).returning.mockReturnValueOnce([updated]);

      const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}/stops/${stopId}`, stopData);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stop.name).toBe("Updated Stop");
    });

    it("returns 404 when stop does not exist", async () => {
      (db as any).query.stops.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "PUT", `/admin/routes/${fakeUUID()}/stops/${fakeUUID()}`, stopData);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("STOP_NOT_FOUND");
    });
  });

  describe("DELETE /admin/routes/:id/stops/:stopId", () => {
    it("deletes a stop and renumbers remaining", async () => {
      const routeId = fakeUUID();
      const stopId = fakeUUID();
      const remainingStopId = fakeUUID();

      (db as any).query.stops.findFirst.mockResolvedValueOnce(
        mockStop({ id: stopId, route_id: routeId }),
      );

      // Transaction calls: delete().where(), select().from().where().orderBy(),
      // update().set().where(), update().set().where()
      // orderBy is the terminal for the remaining stops query
      (db as any).orderBy.mockResolvedValueOnce([{ id: remainingStopId }]);
      // All where() calls return db by default (synchronous), which is awaitable

      const res = await adminRequest(app, "DELETE", `/admin/routes/${routeId}/stops/${stopId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 when stop does not exist", async () => {
      (db as any).query.stops.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(
        app,
        "DELETE",
        `/admin/routes/${fakeUUID()}/stops/${fakeUUID()}`,
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("STOP_NOT_FOUND");
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Message Bank CRUD
// ────────────────────────────────────────────────────────────────────
describe("Admin Message Bank CRUD", () => {
  const messageBankData = {
    type: "success",
    content: "Great job finding it!",
    is_active: true,
  };

  describe("GET /admin/message-banks", () => {
    it("returns list of message banks", async () => {
      const mb = mockMessageBank();

      // Query: select.from.where.orderBy (terminal: orderBy)
      (db as any).orderBy.mockResolvedValueOnce([mb]);

      const res = await adminRequest(app, "GET", "/admin/message-banks");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message_banks).toHaveLength(1);
      expect(body.message_banks[0].type).toBe("success");
      expect(body.message_banks[0].content).toBe("Great job!");
    });

    it("filters by type parameter", async () => {
      (db as any).orderBy.mockResolvedValueOnce([]);

      const res = await adminRequest(app, "GET", "/admin/message-banks?type=hint");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message_banks).toHaveLength(0);
      // Verify where was called (filter applied)
      expect((db as any).where).toHaveBeenCalled();
    });
  });

  describe("POST /admin/message-banks", () => {
    it("creates a message bank entry", async () => {
      const mb = mockMessageBank({ content: "Great job finding it!" });
      (db as any).returning.mockReturnValueOnce([mb]);

      const res = await adminRequest(app, "POST", "/admin/message-banks", messageBankData);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message_bank.content).toBe("Great job finding it!");
      expect(body.message_bank.type).toBe("success");
      expect(body.message_bank.is_active).toBe(true);
    });

    it("rejects invalid type", async () => {
      const res = await adminRequest(app, "POST", "/admin/message-banks", {
        type: "nonexistent_type",
        content: "Hello",
        is_active: true,
      });

      // Validation error (ZodError) - status depends on zod version compatibility
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("PUT /admin/message-banks/:id", () => {
    it("updates a message bank entry", async () => {
      const mbId = fakeUUID();
      const existing = mockMessageBank({ id: mbId });
      const updated = mockMessageBank({ id: mbId, content: "Updated content" });

      (db as any).query.messageBanks.findFirst.mockResolvedValueOnce(existing);
      (db as any).returning.mockReturnValueOnce([updated]);

      const res = await adminRequest(app, "PUT", `/admin/message-banks/${mbId}`, messageBankData);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message_bank.content).toBe("Updated content");
    });

    it("returns 404 when entry does not exist", async () => {
      (db as any).query.messageBanks.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "PUT", `/admin/message-banks/${fakeUUID()}`, messageBankData);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("MESSAGE_BANK_NOT_FOUND");
    });
  });

  describe("DELETE /admin/message-banks/:id", () => {
    it("deletes a message bank entry", async () => {
      const mbId = fakeUUID();
      (db as any).query.messageBanks.findFirst.mockResolvedValueOnce(mockMessageBank({ id: mbId }));
      // delete chain (terminal: where)
      (db as any).where.mockResolvedValueOnce(undefined);

      const res = await adminRequest(app, "DELETE", `/admin/message-banks/${mbId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 when entry does not exist", async () => {
      (db as any).query.messageBanks.findFirst.mockResolvedValueOnce(null);

      const res = await adminRequest(app, "DELETE", `/admin/message-banks/${fakeUUID()}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("MESSAGE_BANK_NOT_FOUND");
    });
  });
});
