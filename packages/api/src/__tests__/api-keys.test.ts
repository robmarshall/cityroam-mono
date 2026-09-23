import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

import { db } from "../db/index.js";
import { adminApiKeys, routes } from "../db/schema/index.js";
import {
  base62ToUuid,
  generateApiKey,
  hashApiKeySecret,
  parseApiKey,
  uuidToBase62,
  LAST_USED_WRITE_INTERVAL_MS,
} from "../lib/api-keys.js";
import { ADMIN_API_KEY_GRANTABLE_SCOPES } from "@cityroam/shared/constants";
import {
  createTestApp,
  adminRequest,
  apiKeyRequest,
  createTestApiKey,
  jsonRequest,
  mockRoute,
  mockRouteBlock,
  mockRouteGroup,
  mockMessageBank,
} from "./helpers.js";

const mockDb = db as any;
let app: Hono;

function uuid(): string {
  return crypto.randomUUID();
}

const validRoute = (overrides: Record<string, unknown> = {}) => ({
  name: "Leeds Loop",
  route_family_id: uuid(),
  language: "en",
  estimated_duration_mins: 90,
  estimated_distance_km: 3.2,
  ...overrides,
});

const validGroups = [
  {
    name: "Start",
    blocks: [{ type: "message", config: { type: "message", content: "Welcome" } }],
  },
];

beforeEach(() => {
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
  for (const table of Object.values(mockDb.query) as any[]) {
    table.findFirst.mockReset();
  }

  app = createTestApp();
});

// ────────────────────────────────────────────────────────────────────
// Token format
// ────────────────────────────────────────────────────────────────────

describe("api key tokens", () => {
  it("generates crk_<env>_<keyId>_<secret> and parses it back", () => {
    const key = generateApiKey("stg");
    expect(key.token).toMatch(/^crk_stg_[0-9A-Za-z]{22}_[A-Za-z0-9_-]{43}$/);
    expect(key.token.startsWith(`${key.prefix}_`)).toBe(true);

    const parsed = parseApiKey(key.token)!;
    expect(parsed.env).toBe("stg");
    expect(parsed.keyId).toBe(key.id);
    expect(hashApiKeySecret(parsed.secret)).toBe(key.tokenHash);
    expect(key.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.secret.endsWith(key.last4)).toBe(true);
  });

  it("round-trips uuids through fixed-width base62", () => {
    for (const id of [uuid(), "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff"]) {
      const encoded = uuidToBase62(id);
      expect(encoded).toHaveLength(22);
      expect(base62ToUuid(encoded)).toBe(id);
    }
    // 62^22 overshoots 2^128; values past it are not uuids.
    expect(base62ToUuid("z".repeat(22))).toBeNull();
  });

  it("never issues the same secret twice", () => {
    const hashes = new Set(Array.from({ length: 50 }, () => generateApiKey("dev").tokenHash));
    expect(hashes.size).toBe(50);
  });

  it("rejects malformed tokens", () => {
    const { token } = generateApiKey("dev");
    expect(parseApiKey(token.replace("crk_dev_", "crk_xyz_"))).toBeNull();
    expect(parseApiKey(token.slice(0, -1))).toBeNull();
    expect(parseApiKey(`${token}A`)).toBeNull();
    expect(parseApiKey("crk_dev_short_secret")).toBeNull();
    expect(parseApiKey("not-a-key")).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// Verification
// ────────────────────────────────────────────────────────────────────

describe("requireAdmin with an API key", () => {
  it("accepts a valid key that holds the route's scope", async () => {
    const { token } = createTestApiKey(["images:read"]);
    const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placeholder).toBe("{{IMAGE:leeds-town-hall}}");
  });

  it("reaches the handler for a routes:read key", async () => {
    const { token } = createTestApiKey(["routes:read"]);
    mockDb.query.routes.findFirst.mockResolvedValueOnce(null);

    const res = await apiKeyRequest(app, token, "GET", `/admin/routes/${uuid()}`);
    // 404 from the handler, not 401/403 from the middleware
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ROUTE_NOT_FOUND");
  });

  it("gives the same 401 for an unknown key id and a wrong secret", async () => {
    const { token } = createTestApiKey(["images:read"]);
    const wrongSecret = `${token.slice(0, -4)}${token.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;

    const bad = await apiKeyRequest(app, wrongSecret, "GET", "/admin/route-images/x");
    mockDb.query.adminApiKeys.findFirst.mockResolvedValue(undefined);
    const unknown = await apiKeyRequest(app, token, "GET", "/admin/route-images/x");

    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    const [badBody, unknownBody] = [await bad.json(), await unknown.json()];
    expect(badBody).toEqual(unknownBody);
    expect(badBody.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("rejects a revoked key", async () => {
    const { token } = createTestApiKey(["images:read"], { revoked_at: new Date(), revoked_by: "admin" });
    const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("rejects an expired key and accepts one that has not expired yet", async () => {
    const expired = createTestApiKey(["images:read"], { expires_at: new Date(Date.now() - 1000) });
    expect((await apiKeyRequest(app, expired.token, "GET", "/admin/route-images/x")).status).toBe(401);

    const live = createTestApiKey(["images:read"], { expires_at: new Date(Date.now() + 86_400_000) });
    expect((await apiKeyRequest(app, live.token, "GET", "/admin/route-images/x")).status).toBe(200);
  });

  it("rejects a key minted for another environment (API_KEY_ENV=dev)", async () => {
    for (const env of ["stg", "prd"] as const) {
      const { token } = createTestApiKey(["images:read"], { env });
      const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe("ADMIN_UNAUTHORIZED");
    }
  });

  it("rejects a malformed crk_ token without a lookup", async () => {
    const res = await apiKeyRequest(app, "crk_dev_nope_nope", "GET", "/admin/route-images/x");
    expect(res.status).toBe(401);
    expect(mockDb.query.adminApiKeys.findFirst).not.toHaveBeenCalled();
  });

  it("ignores scopes on the row that the constants no longer define", async () => {
    const { token } = createTestApiKey(["events:read" as any]);
    const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SCOPE_REQUIRED");
  });
});

describe("scope enforcement", () => {
  it("returns 403 ADMIN_SCOPE_REQUIRED naming the missing scope", async () => {
    const { token } = createTestApiKey(["routes:read"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/routes", validRoute({ is_active: false }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(body.error).toContain("routes:write");
  });

  it.each([
    ["GET", "/admin/routes", "routes:read"],
    ["GET", "/admin/route-families", "routes:read"],
    ["PUT", `/admin/blocks/${crypto.randomUUID()}`, "routes:write"],
    ["PUT", `/admin/routes/${crypto.randomUUID()}/groups/reorder`, "routes:write"],
    ["POST", "/admin/route-families", "routes:write"],
    ["GET", "/admin/message-banks", "message-banks:read"],
    ["POST", "/admin/message-banks", "message-banks:write"],
    ["POST", "/admin/upload", "images:write"],
    ["GET", "/admin/route-images/x", "images:read"],
  ])("%s %s requires %s", async (method, path, scope) => {
    const others = ADMIN_API_KEY_GRANTABLE_SCOPES.filter((s) => s !== scope);
    const { token } = createTestApiKey(others);
    const res = await apiKeyRequest(app, token, method, path, method === "GET" ? undefined : {});
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(body.error).toContain(scope);
  });

  it("lets an images:write key request an upload URL", async () => {
    const { token } = createTestApiKey(["images:write"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/upload", {
      filename: "town-hall.jpg",
      content_type: "image/jpeg",
      slug: "leeds-town-hall",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).placeholder).toBe("{{IMAGE:leeds-town-hall}}");
  });

  it("lets a message-banks:write key create an entry", async () => {
    const { token } = createTestApiKey(["message-banks:write"]);
    mockDb.returning.mockReturnValueOnce([mockMessageBank({ language: "en" })]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", {
      type: "success",
      content: "Nailed it!",
    });
    expect(res.status).toBe(201);
  });

  it.each([
    ["GET", "/admin/dashboard"],
    ["GET", "/admin/events"],
    ["POST", "/admin/events"],
    ["GET", `/admin/events/${crypto.randomUUID()}`],
    ["PATCH", `/admin/events/${crypto.randomUUID()}`],
    ["POST", `/admin/events/${crypto.randomUUID()}/refund`],
    ["POST", `/admin/events/${crypto.randomUUID()}/resend-code`],
    ["POST", `/admin/events/${crypto.randomUUID()}/resend-email`],
    ["DELETE", `/admin/routes/${crypto.randomUUID()}`],
    ["DELETE", `/admin/route-families/${crypto.randomUUID()}`],
    ["DELETE", `/admin/message-banks/${crypto.randomUUID()}`],
  ])("%s %s is session-only", async (method, path) => {
    const { token } = createTestApiKey([...ADMIN_API_KEY_GRANTABLE_SCOPES]);
    const res = await apiKeyRequest(app, token, method, path, method === "GET" ? undefined : {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SESSION_REQUIRED");
  });
});

describe("session JWT", () => {
  it("still reaches session-only routes", async () => {
    mockDb.query.events.findFirst.mockResolvedValueOnce(null);
    const res = await adminRequest(app, "GET", `/admin/events/${uuid()}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("EVENT_NOT_FOUND");
  });

  it("still reaches scoped routes", async () => {
    mockDb.query.routes.findFirst.mockResolvedValueOnce(null);
    const res = await adminRequest(app, "GET", `/admin/routes/${uuid()}`);
    expect(res.status).toBe(404);

    const images = await adminRequest(app, "GET", "/admin/route-images/leeds-town-hall");
    expect(images.status).toBe(200);
  });

  it("never touches the api key table", async () => {
    await adminRequest(app, "GET", "/admin/route-images/x");
    expect(mockDb.query.adminApiKeys.findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 without any credential", async () => {
    const res = await jsonRequest(app, "GET", "/admin/routes");
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("ADMIN_UNAUTHORIZED");
  });
});

// ────────────────────────────────────────────────────────────────────
// Activation is human-only
// ────────────────────────────────────────────────────────────────────

describe("route activation with an API key", () => {
  it("refuses to create an active route", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/routes", validRoute({ is_active: true }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(body.error).toContain("routes:publish");
    expect(mockDb.insert).not.toHaveBeenCalledWith(routes);
  });

  it("refuses when is_active is omitted, because it defaults to true", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/routes", validRoute());
    expect(res.status).toBe(403);
  });

  it("creates an inactive route", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    mockDb.returning.mockReturnValueOnce([mockRoute({ id: uuid(), is_active: false })]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/routes", validRoute({ is_active: false }));
    expect(res.status).toBe(201);
    expect((await res.json()).route.is_active).toBe(false);
  });

  it("refuses bulk-groups with an active route", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/routes/bulk-groups", {
      route: validRoute({ is_active: true }),
      groups: validGroups,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("creates an inactive route through bulk-groups", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const route = mockRoute({ id: uuid(), is_active: false });
    const group = mockRouteGroup({ id: uuid(), route_id: route.id });
    mockDb.returning
      .mockReturnValueOnce([route])
      .mockReturnValueOnce([group])
      .mockReturnValueOnce([mockRouteBlock({ id: uuid(), group_id: group.id })]);

    const res = await apiKeyRequest(app, token, "POST", "/admin/routes/bulk-groups", {
      route: validRoute({ is_active: false }),
      groups: validGroups,
    });
    expect(res.status).toBe(201);
  });

  it("refuses to flip an inactive route to active", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const id = uuid();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id, is_active: false }));

    const res = await apiKeyRequest(app, token, "PUT", `/admin/routes/${id}`, validRoute({ is_active: true }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ADMIN_SCOPE_REQUIRED");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("allows editing a route that is already active while keeping it active", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const id = uuid();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id, is_active: true }));
    mockDb.returning.mockReturnValueOnce([mockRoute({ id, name: "Renamed", is_active: true })]);

    const res = await apiKeyRequest(app, token, "PUT", `/admin/routes/${id}`, validRoute({ name: "Renamed", is_active: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).route.name).toBe("Renamed");
  });

  it("allows deactivating a route", async () => {
    const { token } = createTestApiKey(["routes:write"]);
    const id = uuid();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id, is_active: true }));
    mockDb.returning.mockReturnValueOnce([mockRoute({ id, is_active: false })]);

    const res = await apiKeyRequest(app, token, "PUT", `/admin/routes/${id}`, validRoute({ is_active: false }));
    expect(res.status).toBe(200);
  });

  it("still lets a signed-in admin activate a route", async () => {
    const id = uuid();
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id, is_active: false }));
    // The has-groups check finds one
    mockDb.limit.mockImplementationOnce(() => Promise.resolve([{ id: uuid() }]));
    mockDb.returning.mockReturnValueOnce([mockRoute({ id, is_active: true })]);

    const res = await adminRequest(app, "PUT", `/admin/routes/${id}`, validRoute({ is_active: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).route.is_active).toBe(true);
  });

  it("gates activation on the routes:publish scope itself", async () => {
    // No key can be issued with it (the create schema refuses), but the
    // server-side check is scope-based rather than a blanket key ban.
    const { token } = createTestApiKey(["routes:write", "routes:publish"]);
    mockDb.returning.mockReturnValueOnce([mockRoute({ id: uuid(), is_active: true })]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/routes", validRoute({ is_active: true }));
    expect(res.status).toBe(201);
  });
});

// ────────────────────────────────────────────────────────────────────
// CSRF: admin routes are bearer-authenticated, not cookie-authenticated
// ────────────────────────────────────────────────────────────────────

describe("CSRF regression", () => {
  it("accepts an API-key POST with no Origin or Sec-Fetch-Site header", async () => {
    const { token } = createTestApiKey(["message-banks:write"]);
    mockDb.returning.mockReturnValueOnce([mockMessageBank()]);
    const res = await app.request("/admin/message-banks", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "success", content: "Well done" }),
    });
    expect(res.status).toBe(201);
  });

  it("does not run csrfGuard on admin routes", async () => {
    // A cross-site signal that csrfGuard would reject with 403 CSRF_REJECTED.
    const { token } = createTestApiKey(["message-banks:write"]);
    mockDb.returning.mockReturnValueOnce([mockMessageBank()]);
    const res = await apiKeyRequest(
      app,
      token,
      "POST",
      "/admin/message-banks",
      { type: "success", content: "Well done" },
      { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    );
    expect(res.status).toBe(201);
  });

  it("keeps csrfGuard out of the admin router source", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../routes/admin.ts"), "utf8");
    expect(source).not.toContain("csrfGuard");
  });
});

// ────────────────────────────────────────────────────────────────────
// Live content edits warn via X-Live-Events
// ────────────────────────────────────────────────────────────────────

describe("X-Live-Events", () => {
  const blockBody = { type: "message", config: { type: "message", content: "Updated" } };

  function stubBlockUpdate(blockId: string) {
    const existing = mockRouteBlock({ id: blockId, group_id: uuid() });
    mockDb.query.routeBlocks.findFirst.mockResolvedValueOnce(existing);
    mockDb.returning.mockReturnValueOnce([{ ...existing, config: blockBody.config }]);
  }

  it("flags a block edit on a route with live events and still performs it", async () => {
    const blockId = uuid();
    stubBlockUpdate(blockId);
    // First `where` belongs to the update; the second is the live-event count.
    mockDb.where
      .mockImplementationOnce(() => db)
      .mockImplementationOnce(() => Promise.resolve([{ count: 2 }]));

    const res = await adminRequest(app, "PUT", `/admin/blocks/${blockId}`, blockBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Live-Events")).toBe("2");
    expect((await res.json()).block.config.content).toBe("Updated");
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("omits the header when nothing is playing the route", async () => {
    const blockId = uuid();
    stubBlockUpdate(blockId);
    mockDb.where
      .mockImplementationOnce(() => db)
      .mockImplementationOnce(() => Promise.resolve([{ count: 0 }]));

    const res = await adminRequest(app, "PUT", `/admin/blocks/${blockId}`, blockBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Live-Events")).toBeNull();
  });

  it("flags a group rename", async () => {
    const routeId = uuid();
    const groupId = uuid();
    const group = mockRouteGroup({ id: groupId, route_id: routeId });
    mockDb.query.routeGroups.findFirst.mockResolvedValueOnce(group);
    mockDb.returning.mockReturnValueOnce([{ ...group, name: "Renamed" }]);
    mockDb.where
      .mockImplementationOnce(() => db)
      .mockImplementationOnce(() => Promise.resolve([{ count: 1 }]));

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}/groups/${groupId}`, { name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Live-Events")).toBe("1");
  });

  it("flags a group reorder", async () => {
    const routeId = uuid();
    const [g1, g2] = [uuid(), uuid()];
    mockDb.query.routes.findFirst.mockResolvedValueOnce(mockRoute({ id: routeId }));
    mockDb.where
      .mockResolvedValueOnce([{ id: g1 }, { id: g2 }]) // existing groups
      .mockResolvedValueOnce(undefined) // position update
      .mockResolvedValueOnce([{ count: 3 }]); // live events

    const res = await adminRequest(app, "PUT", `/admin/routes/${routeId}/groups/reorder`, { group_ids: [g2, g1] });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Live-Events")).toBe("3");
  });

  it("is exposed to browsers through CORS", async () => {
    const res = await app.request("/health", { headers: { Origin: "https://admin.test.com" } });
    expect(res.headers.get("access-control-expose-headers")).toContain("X-Live-Events");
  });
});

// ────────────────────────────────────────────────────────────────────
// last_used_at throttling
// ────────────────────────────────────────────────────────────────────

describe("last_used_at", () => {
  function lastUsedWrites() {
    return mockDb.update.mock.calls.filter(([table]: [unknown]) => table === adminApiKeys);
  }

  it("records first use with the caller's IP", async () => {
    const { token } = createTestApiKey(["images:read"], { last_used_at: null, last_used_ip: null });
    const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/x", undefined, {
      "x-real-ip": "203.0.113.9",
    });
    expect(res.status).toBe(200);
    expect(lastUsedWrites()).toHaveLength(1);
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ last_used_ip: "203.0.113.9", last_used_at: expect.any(Date) }),
    );
  });

  it("skips the write when the key was used within the interval", async () => {
    const { token } = createTestApiKey(["images:read"], {
      last_used_at: new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS + 60_000),
    });
    await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
    expect(lastUsedWrites()).toHaveLength(0);
  });

  it("writes again once the last use is stale", async () => {
    const { token } = createTestApiKey(["images:read"], {
      last_used_at: new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS - 60_000),
    });
    await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
    expect(lastUsedWrites()).toHaveLength(1);
  });

  it("does not record use for a rejected key", async () => {
    const { token } = createTestApiKey(["images:read"], { last_used_at: null, revoked_at: new Date() });
    await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
    expect(lastUsedWrites()).toHaveLength(0);
  });

  it("never fails the request when the write fails", async () => {
    const { token } = createTestApiKey(["images:read"], { last_used_at: null });
    mockDb.where.mockImplementationOnce(() => Promise.reject(new Error("db down")));
    const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/x");
    expect(res.status).toBe(200);
  });
});
