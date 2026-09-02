import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ── Mock Resend ─────────────────────────────────────────────────────
const mockResendEmailsSend = vi.fn();
vi.mock("resend", () => {
  const ResendMock = function (this: any) {
    this.emails = { send: mockResendEmailsSend };
  } as any;
  return { Resend: ResendMock };
});

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
    onConflictDoNothing: vi.fn(() => mockDb),
    returning: vi.fn(() => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    transaction: vi.fn((fn: any) => fn(mockDb)),
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

vi.mock("../services/s3.js", () => ({
  generatePresignedUploadUrl: vi.fn().mockResolvedValue({
    upload_url: "https://s3.test.com/presigned-url",
    key: "uploads/test-file.jpg",
  }),
}));

import { db } from "../db/index.js";
import { emailRetryPolicy } from "../services/email.js";
import {
  createTestApp,
  adminRequest,
  fakeUUID,
  resetUUIDs,
  mockEvent,
  mockRoute,
  mockRouteGroup,
  mockRouteBlock,
} from "./helpers.js";

/** A real v4 UUID, for bodies that go through Zod's uuid() check. */
function validUUID(): string {
  return crypto.randomUUID();
}

let app: Hono;
const originalBackoff = emailRetryPolicy.backoffMs;

beforeEach(() => {
  resetUUIDs();

  const mockDb = db as any;
  for (const chain of [
    "select", "from", "where", "groupBy", "orderBy", "limit", "offset",
    "insert", "values", "onConflictDoNothing", "update", "set", "delete",
  ]) {
    mockDb[chain].mockReset().mockImplementation(() => db);
  }
  mockDb.returning.mockReset().mockReturnValue([]);
  mockDb.transaction.mockReset().mockImplementation((fn: any) => fn(db));
  mockDb.execute.mockReset().mockResolvedValue([{ "?column?": 1 }]);

  for (const table of Object.keys((db as any).query)) {
    (db as any).query[table].findFirst.mockReset();
  }

  mockResendEmailsSend.mockReset();
  // The waits are the one thing not worth reproducing in a unit test.
  emailRetryPolicy.backoffMs = [0, 0];

  app = createTestApp();
});

afterEach(() => {
  emailRetryPolicy.backoffMs = originalBackoff;
});

const routeBody = {
  language: "en",
  name: "City Centre Tour",
  description: "A nice walk",
  estimated_duration_mins: 60,
  estimated_distance_km: 2.5,
};

// ────────────────────────────────────────────────────────────────────
// 1. Unknown route_family_id
// ────────────────────────────────────────────────────────────────────

describe("route family existence guards", () => {
  it("POST /admin/routes returns 404 when the family does not exist", async () => {
    // assertFamilyExists: no matching family row
    (db as any).limit.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "POST", "/admin/routes", {
      ...routeBody,
      route_family_id: validUUID(),
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ROUTE_FAMILY_NOT_FOUND");
  });

  it("POST /admin/routes/bulk-groups returns 404 when the family does not exist", async () => {
    (db as any).limit.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups", {
      route: { ...routeBody, route_family_id: validUUID(), is_active: false },
      groups: [
        {
          name: "Intro",
          blocks: [
            { type: "message", config: { type: "message", content: "Hi" }, delay_ms: 0 },
          ],
        },
      ],
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ROUTE_FAMILY_NOT_FOUND");
  });

  it("POST /admin/routes still auto-creates a family when only a city is given", async () => {
    const route = mockRoute({ name: "City Centre Tour" });
    (db as any).returning
      .mockReturnValueOnce([{ id: fakeUUID(), name: "City Centre Tour", city: "Leeds" }])
      .mockReturnValueOnce([route]);

    const res = await adminRequest(app, "POST", "/admin/routes", {
      ...routeBody,
      city: "Leeds",
      route_family_id: "",
      is_active: false,
    });

    expect(res.status).toBe(201);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. Duplicate language variants
// ────────────────────────────────────────────────────────────────────

describe("one active route per family and language", () => {
  it("POST /admin/routes returns 409 when an active variant already exists", async () => {
    // assertFamilyExists -> found; activeVariantExists -> clash
    (db as any).limit
      .mockResolvedValueOnce([{ id: fakeUUID() }])
      .mockResolvedValueOnce([{ id: fakeUUID() }]);

    const res = await adminRequest(app, "POST", "/admin/routes", {
      ...routeBody,
      route_family_id: validUUID(),
      is_active: true,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_LANGUAGE_VARIANT");
  });

  it("POST /admin/routes allows a second inactive variant", async () => {
    (db as any).limit.mockResolvedValueOnce([{ id: fakeUUID() }]);
    (db as any).returning.mockReturnValueOnce([mockRoute({ is_active: false })]);

    const res = await adminRequest(app, "POST", "/admin/routes", {
      ...routeBody,
      route_family_id: validUUID(),
      is_active: false,
    });

    expect(res.status).toBe(201);
  });

  it("PUT /admin/routes/:id returns 409 when another active variant exists", async () => {
    const routeId = fakeUUID();
    (db as any).query.routes.findFirst.mockResolvedValueOnce(
      mockRoute({ id: routeId, is_active: true, route_family_id: fakeUUID() }),
    );
    // activeVariantExists (the no-groups check is skipped: already active)
    (db as any).limit.mockResolvedValueOnce([{ id: fakeUUID() }]);

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}`, {
      ...routeBody,
      city: "Leeds",
      is_active: true,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_LANGUAGE_VARIANT");
  });

  it("maps the database unique violation to the same 409", async () => {
    const routeId = fakeUUID();
    (db as any).query.routes.findFirst.mockResolvedValueOnce(
      mockRoute({ id: routeId, is_active: true }),
    );
    (db as any).limit.mockResolvedValueOnce([]);
    (db as any).returning.mockImplementationOnce(() => {
      const err: any = new Error("duplicate key value violates unique constraint");
      err.code = "23505";
      err.constraint_name = "routes_family_language_active_unique";
      throw err;
    });

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}`, {
      ...routeBody,
      city: "Leeds",
      is_active: true,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_LANGUAGE_VARIANT");
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. Activating an empty route
// ────────────────────────────────────────────────────────────────────

describe("a route cannot be activated with no groups", () => {
  it("returns 409 on the inactive -> active transition", async () => {
    const routeId = fakeUUID();
    (db as any).query.routes.findFirst.mockResolvedValueOnce(
      mockRoute({ id: routeId, is_active: false }),
    );
    // group lookup: none
    (db as any).limit.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}`, {
      ...routeBody,
      city: "Leeds",
      is_active: true,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ROUTE_HAS_NO_GROUPS");
  });

  it("allows activation once the route has a group", async () => {
    const routeId = fakeUUID();
    (db as any).query.routes.findFirst.mockResolvedValueOnce(
      mockRoute({ id: routeId, is_active: false }),
    );
    (db as any).limit
      .mockResolvedValueOnce([{ id: fakeUUID() }]) // has a group
      .mockResolvedValueOnce([]); // no competing active variant
    (db as any).returning.mockReturnValueOnce([mockRoute({ id: routeId })]);

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}`, {
      ...routeBody,
      city: "Leeds",
      is_active: true,
    });

    expect(res.status).toBe(200);
  });

  it("leaves an already-active route editable", async () => {
    const routeId = fakeUUID();
    (db as any).query.routes.findFirst.mockResolvedValueOnce(
      mockRoute({ id: routeId, is_active: true }),
    );
    (db as any).limit.mockResolvedValueOnce([]); // no competing variant
    (db as any).returning.mockReturnValueOnce([mockRoute({ id: routeId, name: "Renamed" })]);

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}`, {
      ...routeBody,
      city: "Leeds",
      name: "Renamed",
      is_active: true,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).route.name).toBe("Renamed");
  });
});

// ────────────────────────────────────────────────────────────────────
// 4. Block positions
// ────────────────────────────────────────────────────────────────────

const blockBody = {
  type: "message",
  config: { type: "message", content: "Hello world" },
  delay_ms: 0,
};

describe("block positions stay dense and collision-free", () => {
  it("shifts later siblings up when a block is inserted in the middle", async () => {
    const groupId = fakeUUID();
    (db as any).query.routeGroups.findFirst.mockResolvedValueOnce(
      mockRouteGroup({ id: groupId }),
    );

    const existingBlocks = [
      { id: fakeUUID(), position: 1 },
      { id: fakeUUID(), position: 2 },
    ];

    (db as any).where
      .mockResolvedValueOnce([{ max: 2 }]) // max position -> next is 3
      .mockResolvedValueOnce([{ count: 0 }]); // no live events on this group
    (db as any).orderBy.mockResolvedValueOnce(existingBlocks);
    (db as any).returning.mockReturnValueOnce([
      mockRouteBlock({ group_id: groupId, position: 1 }),
    ]);

    const res = await adminRequest(app, "POST", `/admin/groups/${groupId}/blocks`, {
      ...blockBody,
      position: 1,
    });

    expect(res.status).toBe(201);
    expect((await res.json()).block.position).toBe(1);

    // The two siblings were renumbered before the insert.
    expect((db as any).update).toHaveBeenCalled();
    const inserted = (db as any).values.mock.calls.at(-1)![0];
    expect(inserted.position).toBe(1);
  });

  it("refuses a mid-group insert while an event is playing that group", async () => {
    const groupId = fakeUUID();
    (db as any).query.routeGroups.findFirst.mockResolvedValueOnce(
      mockRouteGroup({ id: groupId }),
    );

    (db as any).where
      .mockResolvedValueOnce([{ max: 2 }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const res = await adminRequest(app, "POST", `/admin/groups/${groupId}/blocks`, {
      ...blockBody,
      position: 0,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("GROUP_HAS_LIVE_EVENTS");
  });

  it("clamps a position past the end and skips the shift", async () => {
    const groupId = fakeUUID();
    (db as any).query.routeGroups.findFirst.mockResolvedValueOnce(
      mockRouteGroup({ id: groupId }),
    );
    (db as any).where.mockResolvedValueOnce([{ max: 1 }]); // next is 2
    (db as any).returning.mockReturnValueOnce([
      mockRouteBlock({ group_id: groupId, position: 2 }),
    ]);

    const res = await adminRequest(app, "POST", `/admin/groups/${groupId}/blocks`, {
      ...blockBody,
      position: 99,
    });

    expect(res.status).toBe(201);
    const inserted = (db as any).values.mock.calls.at(-1)![0];
    expect(inserted.position).toBe(2);
    // No live-event check and no shift: appending is always safe.
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("bulk-groups renumbers caller positions to a dense sequence", async () => {
    (db as any).limit.mockResolvedValueOnce([{ id: fakeUUID() }]); // family exists
    (db as any).returning
      .mockReturnValueOnce([mockRoute({ name: "Bulk Route" })])
      .mockReturnValueOnce([mockRouteGroup({ name: "Intro" })])
      .mockReturnValueOnce([mockRouteBlock({ position: 0 })])
      .mockReturnValueOnce([mockRouteBlock({ position: 1 })]);

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups", {
      route: { ...routeBody, route_family_id: validUUID(), is_active: false },
      groups: [
        {
          name: "Intro",
          blocks: [
            // Deliberately out of order and gapped.
            { position: 9, type: "message", config: { type: "message", content: "Second" }, delay_ms: 0 },
            { position: 4, type: "message", config: { type: "message", content: "First" }, delay_ms: 0 },
          ],
        },
      ],
    });

    expect(res.status).toBe(201);

    const blockInserts = (db as any).values.mock.calls
      .map((call: any[]) => call[0])
      .filter((value: any) => value && "group_id" in value && "config" in value);

    expect(blockInserts.map((b: any) => b.position)).toEqual([0, 1]);
    // The lower caller position sorts first, regardless of array order.
    expect(blockInserts.map((b: any) => b.config.content)).toEqual(["First", "Second"]);
  });
});

// ────────────────────────────────────────────────────────────────────
// 5. Resending the code email
// ────────────────────────────────────────────────────────────────────

describe("POST /admin/events/:id/resend-code", () => {
  it("returns 404 for an unknown event", async () => {
    (db as any).query.events.findFirst.mockResolvedValueOnce(null);

    const res = await adminRequest(app, "POST", `/admin/events/${fakeUUID()}/resend-code`);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the event has no buyer email", async () => {
    (db as any).query.events.findFirst.mockResolvedValueOnce(
      mockEvent({ buyer_email: null }),
    );

    const res = await adminRequest(app, "POST", `/admin/events/${fakeUUID()}/resend-code`);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NO_BUYER_EMAIL");
  });

  it("sends the email and clears the failure flag", async () => {
    const event = mockEvent({ buyer_email: "buyer@example.com", language: "en" });
    (db as any).query.events.findFirst.mockResolvedValueOnce(event);
    mockResendEmailsSend.mockResolvedValueOnce({ data: { id: "email_1" } });

    const res = await adminRequest(app, "POST", `/admin/events/${event.id}/resend-code`);

    expect(res.status).toBe(200);
    expect(mockResendEmailsSend).toHaveBeenCalledOnce();

    const written = (db as any).set.mock.calls.at(-1)![0];
    expect(written.code_email_sent_at).toBeInstanceOf(Date);
    expect(written.code_email_failed_at).toBeNull();
  });

  it("returns 502 when every attempt fails", async () => {
    const event = mockEvent({ buyer_email: "buyer@example.com" });
    (db as any).query.events.findFirst.mockResolvedValueOnce(event);
    mockResendEmailsSend.mockRejectedValue(new Error("resend is down"));

    const res = await adminRequest(app, "POST", `/admin/events/${event.id}/resend-code`);

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("EMAIL_SEND_FAILED");
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(3);
  });

  it("is reachable under its original name too", async () => {
    const event = mockEvent({ buyer_email: "buyer@example.com" });
    (db as any).query.events.findFirst.mockResolvedValueOnce(event);
    mockResendEmailsSend.mockResolvedValueOnce({ data: { id: "email_1" } });

    const res = await adminRequest(app, "POST", `/admin/events/${event.id}/resend-email`);
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────
// 6. Failed delivery is visible in the event list
// ────────────────────────────────────────────────────────────────────

describe("GET /admin/events", () => {
  it("reports when the code email never got through", async () => {
    const failedAt = new Date("2026-01-02T03:04:05.000Z");
    (db as any).where.mockResolvedValueOnce([{ count: 1 }]);
    (db as any).offset.mockResolvedValueOnce([
      {
        id: fakeUUID(),
        code: "ABCD1234",
        buyer_email: "buyer@example.com",
        status: "NOT_STARTED",
        created_at: new Date(),
        refund_requested: false,
        code_email_failed_at: failedAt,
      },
    ]);
    (db as any).groupBy.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "GET", "/admin/events");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events[0].code_email_failed_at).toBe(failedAt.toISOString());
  });
});
