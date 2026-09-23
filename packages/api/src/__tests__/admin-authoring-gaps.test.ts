import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Phase 4 of the MCP work: the admin API gaps the route-authoring tools need.
// message-bank language filter, bulk-groups dry run, group create with blocks
// and position, and the route-image listing / existence check.

// ── Mock db module (chainable pattern) ──────────────────────────────
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
      routeBlocks: { findFirst: vi.fn() },
      routeGroups: { findFirst: vi.fn() },
      routeFamilies: { findFirst: vi.fn() },
      adminApiKeys: { findFirst: vi.fn() },
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

vi.mock("../services/s3.js", () => ({
  MAX_LISTED_OBJECTS: 5000,
  generatePresignedUploadUrl: vi.fn(async (key: string) => ({
    upload_url: "https://s3.test.com/presigned",
    key,
  })),
  headObject: vi.fn(),
  listObjects: vi.fn(),
}));

import { db } from "../db/index.js";
import { env } from "../env.js";
import { adminAuditLog, routeBlocks, routeGroups, routes } from "../db/schema/index.js";
import { generatePresignedUploadUrl, headObject, listObjects } from "../services/s3.js";
import {
  createTestApp,
  adminRequest,
  apiKeyRequest,
  createTestApiKey,
  fakeUUID,
  resetUUIDs,
  mockMessageBank,
  mockRoute,
  mockRouteGroup,
  mockRouteBlock,
} from "./helpers.js";

const mockDb = db as any;
const dialect = new PgDialect();
let app: Hono;

/** How the last transaction ended: the real driver commits or rolls back on this. */
let txOutcome: "committed" | "rolled_back" | null;
let txError: unknown;
let auditRows: any[];

function render(fragment: SQL) {
  return dialect.sqlToQuery(fragment);
}

/** Handler inserts, without the audit row requireAdmin writes afterwards. */
function insertedValues(table: unknown): any[] {
  return mockDb.insert.mock.calls
    .map((call: any[], i: number) => ({ table: call[0], i }))
    .filter(({ table: t }: any) => t === table)
    .map(({ i }: any) => mockDb.values.mock.calls[i]?.[0]);
}

beforeEach(() => {
  resetUUIDs();
  txOutcome = null;
  txError = undefined;
  auditRows = [];

  for (const m of [
    "select", "from", "where", "groupBy", "orderBy", "limit", "offset",
    "values", "update", "set", "delete",
  ]) {
    mockDb[m].mockReset().mockImplementation(() => db);
  }
  mockDb.returning.mockReset().mockReturnValue([]);
  mockDb.execute.mockReset().mockResolvedValue([]);
  // Audit rows are captured separately; their `values` call would otherwise
  // shift the index pairing in insertedValues().
  mockDb.insert.mockReset().mockImplementation((table: unknown) => {
    if (table === adminAuditLog) {
      return {
        values: vi.fn(async (row: any) => {
          auditRows.push(row);
        }),
      };
    }
    return db;
  });
  mockDb.transaction.mockReset().mockImplementation(async (fn: any) => {
    try {
      const result = await fn(db);
      txOutcome = "committed";
      return result;
    } catch (err) {
      txOutcome = "rolled_back";
      txError = err;
      throw err;
    }
  });
  for (const table of Object.values(mockDb.query) as any[]) {
    table.findFirst.mockReset();
  }

  vi.mocked(listObjects).mockReset();
  vi.mocked(headObject).mockReset();
  vi.mocked(generatePresignedUploadUrl).mockClear();

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  app = createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
  (env as any).AWS_CDN_BASE_URL = "https://cdn.test.com";
});

// ────────────────────────────────────────────────────────────────────
// 1. GET /admin/message-banks?language=
// ────────────────────────────────────────────────────────────────────

describe("GET /admin/message-banks language filter", () => {
  it("filters by language", async () => {
    mockDb.orderBy.mockResolvedValueOnce([mockMessageBank({ language: "fr" })]);

    const res = await adminRequest(app, "GET", "/admin/message-banks?language=fr");

    expect(res.status).toBe(200);
    expect((await res.json()).message_banks).toHaveLength(1);
    const { sql, params } = render(mockDb.where.mock.calls[0][0]);
    expect(sql).toContain('"language"');
    expect(params).toEqual(["fr"]);
  });

  it("combines language and type", async () => {
    mockDb.orderBy.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "GET", "/admin/message-banks?type=success&language=de");

    expect(res.status).toBe(200);
    const { sql, params } = render(mockDb.where.mock.calls[0][0]);
    expect(sql).toContain('"type"');
    expect(sql).toContain('"language"');
    expect(params).toEqual(["success", "de"]);
  });

  it("applies no filter when both parameters are absent or empty", async () => {
    mockDb.orderBy.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "GET", "/admin/message-banks?language=&type=");

    expect(res.status).toBe(200);
    expect(mockDb.where.mock.calls[0][0]).toBeUndefined();
  });

  it("rejects an unsupported language instead of returning an empty list", async () => {
    const res = await adminRequest(app, "GET", "/admin/message-banks?language=xx");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("en, es, fr, de, nl");
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("works for an API key with message-banks:read", async () => {
    const key = createTestApiKey(["message-banks:read"]);
    mockDb.orderBy.mockResolvedValueOnce([]);

    const res = await apiKeyRequest(app, key.token, "GET", "/admin/message-banks?language=es");
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. POST /admin/routes/bulk-groups?dry_run=true
// ────────────────────────────────────────────────────────────────────

const routeBody = (overrides: Record<string, unknown> = {}) => ({
  name: "Leeds Loop",
  route_family_id: crypto.randomUUID(),
  language: "en",
  estimated_duration_mins: 90,
  estimated_distance_km: 3.2,
  is_active: false,
  ...overrides,
});

const bulkGroups = [
  {
    name: "Start",
    blocks: [
      { type: "message", config: { type: "message", content: "Welcome" } },
      { type: "message", config: { type: "message", content: "Head north" } },
    ],
  },
  {
    name: "Clue",
    blocks: [{ type: "message", config: { type: "message", content: "Look up" } }],
  },
];

/** Returning values for a route + two groups + three blocks. */
function queueBulkInserts() {
  const route = mockRoute({ name: "Leeds Loop", is_active: false, total_stops: 2 });
  const g1 = mockRouteGroup({ route_id: route.id, position: 0, name: "Start" });
  const g2 = mockRouteGroup({ route_id: route.id, position: 1, name: "Clue" });
  mockDb.returning
    .mockReturnValueOnce([route])
    .mockReturnValueOnce([g1])
    .mockReturnValueOnce([mockRouteBlock({ group_id: g1.id, position: 0 })])
    .mockReturnValueOnce([mockRouteBlock({ group_id: g1.id, position: 1 })])
    .mockReturnValueOnce([g2])
    .mockReturnValueOnce([mockRouteBlock({ group_id: g2.id, position: 0 })]);
  return { route, g1, g2 };
}

describe("POST /admin/routes/bulk-groups?dry_run=true", () => {
  it("runs the whole transaction, rolls it back and reports what would be created", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: fakeUUID() }]); // family exists
    const { route } = queueBulkInserts();

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody(),
      groups: bulkGroups,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.valid).toBe(true);
    expect(body.ids_provisional).toBe(true);
    expect(body.summary).toEqual({ groups: 2, blocks: 3, creates_route_family: false });
    expect(body.would_create.route.id).toBe(route.id);
    expect(body.would_create.groups.map((g: any) => g.blocks.length)).toEqual([2, 1]);

    // Every insert ran, inside a transaction that was rolled back, not committed.
    expect(insertedValues(routes)).toHaveLength(1);
    expect(insertedValues(routeGroups)).toHaveLength(2);
    expect(insertedValues(routeBlocks)).toHaveLength(3);
    expect(txOutcome).toBe("rolled_back");
    expect((txError as Error).name).toBe("DryRunRollback");

    // Deferred position uniques are checked before the rollback.
    const executed = mockDb.execute.mock.calls.map(([q]: any[]) => render(q).sql);
    expect(executed).toContain("SET CONSTRAINTS ALL IMMEDIATE");
  });

  it("reports that a family would be created when only a city is given", async () => {
    mockDb.returning.mockReturnValueOnce([{ id: fakeUUID(), name: "Leeds Loop", city: "Leeds" }]);
    queueBulkInserts();

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=1", {
      route: routeBody({ route_family_id: "", city: "Leeds" }),
      groups: bulkGroups,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).summary.creates_route_family).toBe(true);
    expect(txOutcome).toBe("rolled_back");
  });

  it("returns ROUTE_FAMILY_NOT_FOUND like a real run", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody(),
      groups: bulkGroups,
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ROUTE_FAMILY_NOT_FOUND");
    expect(insertedValues(routes)).toHaveLength(0);
    expect(txOutcome).toBe("rolled_back");
  });

  it("returns DUPLICATE_LANGUAGE_VARIANT like a real run", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ id: fakeUUID() }]) // family exists
      .mockResolvedValueOnce([{ id: fakeUUID() }]); // an active variant already exists

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody({ is_active: true }),
      groups: bulkGroups,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_LANGUAGE_VARIANT");
    expect(txOutcome).toBe("rolled_back");
  });

  it("maps a database unique violation to the same 409 as a real run", async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ id: fakeUUID() }])
      .mockResolvedValueOnce([]);
    mockDb.returning.mockImplementationOnce(() => {
      const err: any = new Error("duplicate key value violates unique constraint");
      err.code = "23505";
      err.constraint_name = "routes_family_language_active_unique";
      throw err;
    });

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody({ is_active: true }),
      groups: bulkGroups,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_LANGUAGE_VARIANT");
  });

  it("returns the same validation error as a real run", async () => {
    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody(),
      groups: [],
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("does not let an API key dry-run an active route", async () => {
    const key = createTestApiKey(["routes:write"]);

    const res = await apiKeyRequest(app, key.token, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody({ is_active: true }),
      groups: bulkGroups,
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("lets an API key dry-run an inactive route and tags the audit row", async () => {
    const key = createTestApiKey(["routes:write"]);
    mockDb.limit.mockResolvedValueOnce([{ id: fakeUUID() }]);
    queueBulkInserts();

    const res = await apiKeyRequest(app, key.token, "POST", "/admin/routes/bulk-groups?dry_run=true", {
      route: routeBody(),
      groups: bulkGroups,
    });

    expect(res.status).toBe(200);
    expect(txOutcome).toBe("rolled_back");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].path).toBe("/admin/routes/bulk-groups");
    expect(auditRows[0].status).toBe(200);
    expect(auditRows[0].params).toEqual({ dry_run: "true" });
  });

  it("commits a real run and does not tag its audit row", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: fakeUUID() }]);
    queueBulkInserts();

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups", {
      route: routeBody(),
      groups: bulkGroups,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.dry_run).toBeUndefined();
    expect(body.groups).toHaveLength(2);
    expect(txOutcome).toBe("committed");
    expect(mockDb.execute).not.toHaveBeenCalled();
    expect(auditRows[0].params).toBeNull();
  });

  it("treats dry_run=false as a real run", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: fakeUUID() }]);
    queueBulkInserts();

    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=false", {
      route: routeBody(),
      groups: bulkGroups,
    });

    expect(res.status).toBe(201);
    expect(txOutcome).toBe("committed");
  });

  it("refuses an ambiguous dry_run value rather than guessing", async () => {
    const res = await adminRequest(app, "POST", "/admin/routes/bulk-groups?dry_run=yes", {
      route: routeBody(),
      groups: bulkGroups,
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. POST /admin/routes/:id/groups with blocks and position
// ────────────────────────────────────────────────────────────────────

const messageBlock = (content: string, extra: Record<string, unknown> = {}) => ({
  type: "message",
  config: { type: "message", content },
  ...extra,
});

describe("POST /admin/routes/:id/groups", () => {
  it("still appends an empty group from a name-only body", async () => {
    const routeId = fakeUUID();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where
      .mockResolvedValueOnce([{ max: 1 }]) // max position -> append at 2
      .mockResolvedValueOnce(undefined) // total_stops update
      .mockResolvedValueOnce([{ count: 0 }]); // live-event warning check
    mockDb.returning.mockReturnValueOnce([
      mockRouteGroup({ route_id: routeId, position: 2, name: "Finale" }),
    ]);

    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, { name: "Finale" });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.group.position).toBe(2);
    expect(body.group.blocks).toEqual([]);
    expect(res.headers.get("X-Live-Events")).toBeNull();

    expect(insertedValues(routeGroups)[0]).toMatchObject({ position: 2, name: "Finale" });
    expect(insertedValues(routeBlocks)).toHaveLength(0);
    expect(mockDb.set.mock.calls.at(-1)![0].total_stops).toBe(3);
    expect(txOutcome).toBe("committed");
  });

  it("creates the group and its blocks in one transaction, in caller order", async () => {
    const routeId = fakeUUID();
    const group = mockRouteGroup({ route_id: routeId, position: 0, name: "Start" });
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where
      .mockResolvedValueOnce([{ max: -1 }]) // empty route
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ count: 0 }]);
    mockDb.returning
      .mockReturnValueOnce([group])
      .mockReturnValueOnce([
        mockRouteBlock({ group_id: group.id, position: 1 }),
        mockRouteBlock({ group_id: group.id, position: 0 }),
      ]);

    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, {
      name: "Start",
      blocks: [
        messageBlock("Second", { position: 7 }),
        messageBlock("First", { position: 2 }),
      ],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.group.blocks.map((b: any) => b.position)).toEqual([0, 1]);

    // One multi-row insert with dense positions, sorted by the caller's keys.
    const blockInsert = insertedValues(routeBlocks);
    expect(blockInsert).toHaveLength(1);
    expect(blockInsert[0].map((b: any) => [b.position, b.config.content, b.group_id])).toEqual([
      [0, "First", group.id],
      [1, "Second", group.id],
    ]);
    expect(txOutcome).toBe("committed");
  });

  it("creates nothing when a block is invalid", async () => {
    const routeId = fakeUUID();

    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, {
      name: "Start",
      blocks: [
        messageBlock("Fine"),
        { type: "question", config: { type: "message", content: "type mismatch" } },
      ],
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalledWith(routeGroups);
  });

  it("refuses more than 50 blocks, like bulk create", async () => {
    const res = await adminRequest(app, "POST", `/admin/routes/${fakeUUID()}/groups`, {
      name: "Too long",
      blocks: Array.from({ length: 51 }, (_, i) => messageBlock(`Block ${i}`)),
    });

    expect(res.status).toBe(400);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("rolls the group back when a block insert fails", async () => {
    const routeId = fakeUUID();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where.mockResolvedValueOnce([{ max: 0 }]);
    mockDb.returning
      .mockReturnValueOnce([mockRouteGroup({ route_id: routeId, position: 1 })])
      .mockImplementationOnce(() => {
        throw new Error("connection reset");
      });

    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, {
      name: "Clue",
      blocks: [messageBlock("Look up")],
    });

    expect(res.status).toBe(500);
    // The group insert happened inside the transaction that was then rolled
    // back, and total_stops was never touched.
    expect(insertedValues(routeGroups)).toHaveLength(1);
    expect(txOutcome).toBe("rolled_back");
    expect(mockDb.update).not.toHaveBeenCalledWith(routes);
  });

  it("returns 404 for an unknown route", async () => {
    mockDb.query.routes.findFirst.mockResolvedValueOnce(undefined);

    const res = await adminRequest(app, "POST", `/admin/routes/${fakeUUID()}/groups`, {
      name: "Clue",
      blocks: [messageBlock("Look up")],
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ROUTE_NOT_FOUND");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("inserts at a position and shifts later groups up by one", async () => {
    const routeId = fakeUUID();
    const later = [
      { id: fakeUUID(), position: 2 },
      { id: fakeUUID(), position: 1 },
    ];
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where
      .mockResolvedValueOnce([{ max: 2 }]) // three groups, next would be 3
      .mockResolvedValueOnce([{ count: 0 }]) // no live events on the route
      .mockReturnValueOnce(db); // shift lookup continues to orderBy
    mockDb.orderBy.mockResolvedValueOnce(later);
    mockDb.returning
      .mockReturnValueOnce([mockRouteGroup({ route_id: routeId, position: 1, name: "Detour" })])
      .mockReturnValueOnce([mockRouteBlock({ position: 0 })]);

    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, {
      name: "Detour",
      position: 1,
      blocks: [messageBlock("Turn left")],
    });

    expect(res.status).toBe(201);
    expect((await res.json()).group.position).toBe(1);

    // The shift is one CASE update that moves every group at >= 1 up by one.
    expect(mockDb.update).toHaveBeenCalledWith(routeGroups);
    const shift = mockDb.set.mock.calls.find(([v]: any[]) => v.position !== undefined)![0];
    const { sql, params } = render(shift.position);
    expect(sql).toMatch(/^CASE/);
    expect(params).toEqual([later[0].id, 3, later[1].id, 2]);

    const shiftLookup = render(mockDb.where.mock.calls[2][0]);
    expect(shiftLookup.params).toEqual([routeId, 1]);

    expect(insertedValues(routeGroups)[0].position).toBe(1);
    expect(mockDb.set.mock.calls.at(-1)![0].total_stops).toBe(4);
    // A mid-route insert either refuses or proceeds; it never just warns.
    expect(res.headers.get("X-Live-Events")).toBeNull();
  });

  it("refuses a mid-route insert while an event is playing the route", async () => {
    const routeId = fakeUUID();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where
      .mockResolvedValueOnce([{ max: 2 }])
      .mockResolvedValueOnce([{ count: 2 }]);

    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, {
      name: "Detour",
      position: 0,
      blocks: [messageBlock("Turn left")],
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("GROUP_HAS_LIVE_EVENTS");
    expect(body.error).toContain("2 in-progress events");
    expect(insertedValues(routeGroups)).toHaveLength(0);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(txOutcome).toBe("rolled_back");
  });

  it("appends with only a warning while events are live", async () => {
    const routeId = fakeUUID();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where
      .mockResolvedValueOnce([{ max: 2 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ count: 3 }]);
    mockDb.returning.mockReturnValueOnce([mockRouteGroup({ route_id: routeId, position: 3 })]);

    // A position at or past the end is an append.
    const res = await adminRequest(app, "POST", `/admin/routes/${routeId}/groups`, {
      name: "Encore",
      position: 99,
    });

    expect(res.status).toBe(201);
    expect(res.headers.get("X-Live-Events")).toBe("3");
    expect(insertedValues(routeGroups)[0].position).toBe(3);
    expect(mockDb.update).not.toHaveBeenCalledWith(routeGroups);
  });

  it("refuses an API key without routes:write", async () => {
    const key = createTestApiKey(["routes:read"]);

    const res = await apiKeyRequest(app, key.token, "POST", `/admin/routes/${fakeUUID()}/groups`, {
      name: "Clue",
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SCOPE_REQUIRED");
  });
});

// ────────────────────────────────────────────────────────────────────
// 4. GET /admin/route-images and existence on GET /admin/route-images/:slug
// ────────────────────────────────────────────────────────────────────

describe("GET /admin/route-images", () => {
  const modified = new Date("2026-09-01T10:00:00.000Z");

  it("lists slug photos with their CDN URLs, sorted, skipping keys no placeholder can reach", async () => {
    vi.mocked(listObjects).mockResolvedValueOnce({
      objects: [
        { key: "route-images/town-hall.jpg", size: 2048, last_modified: modified },
        { key: "route-images/", size: 0, last_modified: modified },
        { key: "route-images/corn-exchange.jpg", size: 1024, last_modified: null },
        { key: "route-images/photo.png", size: 10, last_modified: modified },
        { key: "route-images/Bad_Slug.jpg", size: 10, last_modified: modified },
        { key: "route-images/nested/deep.jpg", size: 10, last_modified: modified },
      ],
      truncated: false,
    });

    const res = await adminRequest(app, "GET", "/admin/route-images");

    expect(res.status).toBe(200);
    expect(listObjects).toHaveBeenCalledWith("route-images/", 5000);
    expect(await res.json()).toEqual({
      images: [
        {
          slug: "corn-exchange",
          key: "route-images/corn-exchange.jpg",
          size: 1024,
          last_modified: null,
          url: "https://cdn.test.com/route-images/corn-exchange.jpg",
        },
        {
          slug: "town-hall",
          key: "route-images/town-hall.jpg",
          size: 2048,
          last_modified: modified.toISOString(),
          url: "https://cdn.test.com/route-images/town-hall.jpg",
        },
      ],
      truncated: false,
    });
  });

  it("passes on that the listing hit the cap", async () => {
    vi.mocked(listObjects).mockResolvedValueOnce({
      objects: [{ key: "route-images/a.jpg", size: 1, last_modified: modified }],
      truncated: true,
    });

    const res = await adminRequest(app, "GET", "/admin/route-images");
    expect((await res.json()).truncated).toBe(true);
  });

  it("returns null URLs when no CDN is configured", async () => {
    (env as any).AWS_CDN_BASE_URL = "";
    vi.mocked(listObjects).mockResolvedValueOnce({
      objects: [{ key: "route-images/a.jpg", size: 1, last_modified: modified }],
      truncated: false,
    });

    const res = await adminRequest(app, "GET", "/admin/route-images");
    expect((await res.json()).images[0].url).toBeNull();
  });

  it("allows an API key with images:read", async () => {
    const key = createTestApiKey(["images:read"]);
    vi.mocked(listObjects).mockResolvedValueOnce({ objects: [], truncated: false });

    const res = await apiKeyRequest(app, key.token, "GET", "/admin/route-images");
    expect(res.status).toBe(200);
    expect((await res.json()).images).toEqual([]);
  });

  it("refuses an API key with only routes:read", async () => {
    const key = createTestApiKey(["routes:read"]);

    const res = await apiKeyRequest(app, key.token, "GET", "/admin/route-images");

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(listObjects).not.toHaveBeenCalled();
  });

  it("fails loudly when the bucket cannot be listed", async () => {
    vi.mocked(listObjects).mockRejectedValueOnce(new Error("AccessDenied"));

    const res = await adminRequest(app, "GET", "/admin/route-images");
    expect(res.status).toBe(500);
  });
});

describe("GET /admin/route-images/:slug existence", () => {
  it("reports an existing photo with its size and upload time", async () => {
    const modified = new Date("2026-09-02T08:30:00.000Z");
    vi.mocked(headObject).mockResolvedValueOnce({ size: 4096, last_modified: modified });

    const res = await adminRequest(app, "GET", "/admin/route-images/town-hall");

    expect(res.status).toBe(200);
    expect(headObject).toHaveBeenCalledWith("route-images/town-hall.jpg");
    expect(await res.json()).toEqual({
      slug: "town-hall",
      key: "route-images/town-hall.jpg",
      placeholder: "{{IMAGE:town-hall}}",
      url: "https://cdn.test.com/route-images/town-hall.jpg",
      exists: true,
      size: 4096,
      last_modified: modified.toISOString(),
    });
  });

  it("reports a missing photo", async () => {
    vi.mocked(headObject).mockResolvedValueOnce(null);

    const body = await (await adminRequest(app, "GET", "/admin/route-images/town-hall")).json();
    expect(body).toMatchObject({ exists: false, size: null, last_modified: null });
  });

  it("reports exists: null, not false, when the check itself fails", async () => {
    vi.mocked(headObject).mockRejectedValueOnce(new Error("AccessDenied"));

    const res = await adminRequest(app, "GET", "/admin/route-images/town-hall");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBeNull();
    expect(body.url).toBe("https://cdn.test.com/route-images/town-hall.jpg");
  });

  it("refuses an API key with only routes:read", async () => {
    const key = createTestApiKey(["routes:read"]);

    const res = await apiKeyRequest(app, key.token, "GET", "/admin/route-images/town-hall");
    expect(res.status).toBe(403);
    expect(headObject).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// 5. Upload URL without a CDN
// ────────────────────────────────────────────────────────────────────

describe("POST /admin/upload without a CDN", () => {
  it("returns a null url for a slug upload, matching GET /admin/route-images/:slug", async () => {
    (env as any).AWS_CDN_BASE_URL = "";

    const res = await adminRequest(app, "POST", "/admin/upload", {
      filename: "hall.jpg",
      content_type: "image/jpeg",
      slug: "town-hall",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBeNull();
    expect(body.key).toBe("route-images/town-hall.jpg");
    expect(body.placeholder).toBe("{{IMAGE:town-hall}}");

    vi.mocked(headObject).mockResolvedValueOnce(null);
    const lookup = await (await adminRequest(app, "GET", "/admin/route-images/town-hall")).json();
    expect(lookup.url).toBe(body.url);
  });

  it("returns the CDN URL for a slug upload when a CDN is configured", async () => {
    const res = await adminRequest(app, "POST", "/admin/upload", {
      filename: "hall.jpg",
      content_type: "image/jpeg",
      slug: "town-hall",
    });

    expect((await res.json()).url).toBe("https://cdn.test.com/route-images/town-hall.jpg");
  });
});
