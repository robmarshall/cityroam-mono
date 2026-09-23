import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { adminAuditLog } from "../db/schema/index.js";
import {
  ADMIN_API_KEY_INVALID_LIMIT,
  ADMIN_API_KEY_READ_LIMIT,
  ADMIN_API_KEY_WRITE_LIMIT,
  checkAdminApiKeyRateLimit,
} from "../redis/rate-limit.js";
import { scrubAuditParams, scrubAuditPath } from "../lib/audit-log.js";
import {
  createTestApp,
  adminRequest,
  apiKeyRequest,
  createTestApiKey,
  jsonRequest,
  mockMessageBank,
} from "./helpers.js";

const mockDb = db as any;
const mockRedis = redis as any;
let app: Hono;

// ── In-memory Redis counters for the limiter scripts ────────────────
// The limiters run INCR(+EXPIRE)+TTL or GET+TTL through eval; emulate both.
let counters: Map<string, number>;
function fakeEval(script: string, _numKeys: number, key: string) {
  if (script.includes("INCR")) {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return Promise.resolve([next, 42]);
  }
  return Promise.resolve([counters.get(key) ?? 0, counters.has(key) ? 600 : -2]);
}

// ── Audit rows are captured separately from handler inserts ─────────
let auditRows: any[];
let auditValues: ReturnType<typeof vi.fn>;

const validBank = { type: "success", language: "en", content: "Well done!", is_active: true };

beforeEach(() => {
  counters = new Map();
  auditRows = [];
  auditValues = vi.fn(async (row: any) => {
    auditRows.push(row);
  });

  for (const m of ["select", "from", "where", "orderBy", "limit", "offset", "values", "update", "set", "delete"]) {
    mockDb[m].mockReset().mockImplementation(() => db);
  }
  mockDb.returning.mockReset().mockReturnValue([]);
  mockDb.insert.mockReset().mockImplementation((table: unknown) =>
    table === adminAuditLog ? { values: auditValues } : db,
  );
  for (const table of Object.values(mockDb.query) as any[]) {
    table.findFirst.mockReset();
  }

  mockRedis.eval.mockReset().mockImplementation(fakeEval);

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  app = createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
  mockRedis.eval.mockReset().mockResolvedValue(1);
});

// ────────────────────────────────────────────────────────────────────
// Per-key rate limit
// ────────────────────────────────────────────────────────────────────

describe("per-key rate limit", () => {
  it(`allows ${ADMIN_API_KEY_WRITE_LIMIT} writes a minute and refuses the next with 429 + Retry-After`, async () => {
    const { token } = createTestApiKey(["message-banks:write"]);

    for (let i = 0; i < ADMIN_API_KEY_WRITE_LIMIT; i++) {
      // An invalid body: 400 from the handler, but it still counts.
      const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", {});
      expect(res.status).toBe(400);
    }

    const blocked = await apiKeyRequest(app, token, "POST", "/admin/message-banks", validBank);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("42");
    const body = await blocked.json();
    expect(body.code).toBe("RATE_LIMITED");
    // The handler never ran, so nothing was inserted.
    expect(mockDb.returning).not.toHaveBeenCalled();
  });

  it("does not audit requests refused by the rate limit", async () => {
    const { token } = createTestApiKey(["message-banks:write"]);
    for (let i = 0; i < ADMIN_API_KEY_WRITE_LIMIT; i++) {
      await apiKeyRequest(app, token, "POST", "/admin/message-banks", {});
    }
    const before = auditRows.length;
    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", validBank);
    expect(res.status).toBe(429);
    expect(auditRows.length).toBe(before);
  });

  it("counts reads and writes in separate buckets per key", async () => {
    const { token, row } = createTestApiKey(["message-banks:write", "images:read"]);

    for (let i = 0; i < ADMIN_API_KEY_WRITE_LIMIT; i++) {
      await apiKeyRequest(app, token, "POST", "/admin/message-banks", {});
    }
    // Writes are exhausted; reads are not.
    const read = await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
    expect(read.status).toBe(200);

    expect(counters.get(`ratelimit:adminkey:write:${row.id}`)).toBe(ADMIN_API_KEY_WRITE_LIMIT);
    expect(counters.get(`ratelimit:adminkey:read:${row.id}`)).toBe(1);
  });

  it(`allows ${ADMIN_API_KEY_READ_LIMIT} reads a minute`, async () => {
    const { token } = createTestApiKey(["images:read"]);
    for (let i = 0; i < ADMIN_API_KEY_READ_LIMIT; i++) {
      const res = await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
      expect(res.status).toBe(200);
    }
    const blocked = await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("42");
  });

  it("keeps separate budgets for different keys", async () => {
    const a = createTestApiKey(["message-banks:write"]);
    for (let i = 0; i < ADMIN_API_KEY_WRITE_LIMIT; i++) {
      await apiKeyRequest(app, a.token, "POST", "/admin/message-banks", {});
    }
    const b = createTestApiKey(["message-banks:write"]);
    const res = await apiKeyRequest(app, b.token, "POST", "/admin/message-banks", {});
    expect(res.status).toBe(400);
  });

  it("never limits admin sessions", async () => {
    counters.set("ratelimit:adminkey:write:admin", 10_000);
    for (let i = 0; i < ADMIN_API_KEY_WRITE_LIMIT + 1; i++) {
      const res = await adminRequest(app, "POST", "/admin/message-banks", {});
      expect(res.status).toBe(400);
    }
    const keyBuckets = mockRedis.eval.mock.calls.filter((c: any[]) =>
      String(c[2]).startsWith("ratelimit:adminkey"),
    );
    expect(keyBuckets).toHaveLength(0);
  });

  it("fails open with an error log when Redis is down", async () => {
    const { token } = createTestApiKey(["message-banks:write"]);
    mockRedis.eval.mockReset().mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", {});
    expect(res.status).toBe(400); // reached the handler

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("admin api key rate limit unavailable"),
    );
  });

  it("a Redis outage never grants access to a bad key", async () => {
    mockRedis.eval.mockReset().mockRejectedValue(new Error("ECONNREFUSED"));
    const { token } = createTestApiKey(["message-banks:write"], { revoked_at: new Date() });

    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", validBank);
    expect(res.status).toBe(401);
  });

  it("checkAdminApiKeyRateLimit reports the TTL as retryAfterSeconds once over", async () => {
    counters.set("ratelimit:adminkey:write:k1", ADMIN_API_KEY_WRITE_LIMIT);
    const result = await checkAdminApiKeyRateLimit("k1", "write");
    expect(result).toEqual({
      allowed: false,
      current: ADMIN_API_KEY_WRITE_LIMIT + 1,
      limit: ADMIN_API_KEY_WRITE_LIMIT,
      retryAfterSeconds: 42,
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Invalid-key attempts per IP
// ────────────────────────────────────────────────────────────────────

describe("invalid API key attempts per IP", () => {
  const ipHeaders = { "x-real-ip": "203.0.113.9" };

  it(`refuses the IP with 429 after ${ADMIN_API_KEY_INVALID_LIMIT} failures, before any lookup`, async () => {
    const { token } = createTestApiKey(["message-banks:write"], { revoked_at: new Date() });

    for (let i = 0; i < ADMIN_API_KEY_INVALID_LIMIT; i++) {
      const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", validBank, ipHeaders);
      expect(res.status).toBe(401);
    }
    expect(counters.get("ratelimit:adminkey-invalid:203.0.113.9")).toBe(ADMIN_API_KEY_INVALID_LIMIT);

    mockDb.query.adminApiKeys.findFirst.mockClear();
    const blocked = await apiKeyRequest(app, token, "POST", "/admin/message-banks", validBank, ipHeaders);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("600");
    expect(mockDb.query.adminApiKeys.findFirst).not.toHaveBeenCalled();
  });

  it("counts garbage crk_ tokens too", async () => {
    await apiKeyRequest(app, "crk_dev_nonsense", "POST", "/admin/message-banks", validBank, ipHeaders);
    expect(counters.get("ratelimit:adminkey-invalid:203.0.113.9")).toBe(1);
  });

  it("does not count successful key use", async () => {
    const { token } = createTestApiKey(["message-banks:write"]);
    for (let i = 0; i < 5; i++) {
      await apiKeyRequest(app, token, "POST", "/admin/message-banks", {}, ipHeaders);
    }
    expect(counters.has("ratelimit:adminkey-invalid:203.0.113.9")).toBe(false);
  });

  it("keeps other IPs unaffected", async () => {
    counters.set("ratelimit:adminkey-invalid:203.0.113.9", ADMIN_API_KEY_INVALID_LIMIT);
    const { token } = createTestApiKey(["message-banks:write"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", {}, {
      "x-real-ip": "198.51.100.4",
    });
    expect(res.status).toBe(400);
  });

  it("does not apply to session JWTs", async () => {
    counters.set("ratelimit:adminkey-invalid:203.0.113.9", ADMIN_API_KEY_INVALID_LIMIT);
    const res = await jsonRequest(app, "POST", "/admin/message-banks", {}, {
      Authorization: "Bearer not-a-jwt",
      ...ipHeaders,
    });
    expect(res.status).toBe(401);
  });

  it("fails open when Redis is down", async () => {
    mockRedis.eval.mockReset().mockRejectedValue(new Error("ECONNREFUSED"));
    const { token } = createTestApiKey(["message-banks:write"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", {}, ipHeaders);
    expect(res.status).toBe(400);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("invalid-attempt limit unavailable"),
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// Audit log
// ────────────────────────────────────────────────────────────────────

describe("admin audit log", () => {
  it("records a session mutation with the admin as actor", async () => {
    const created = mockMessageBank();
    mockDb.returning.mockReturnValueOnce([created]);

    const res = await adminRequest(app, "POST", "/admin/message-banks", validBank);
    expect(res.status).toBe(201);

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      actor_type: "session",
      actor_id: "admin",
      actor_name: "admin",
      method: "POST",
      path: "/admin/message-banks",
      params: null,
      status: 201,
    });
  });

  it("records an API key mutation with the key as actor, route params and 4xx status", async () => {
    const { token, row } = createTestApiKey(["message-banks:write"], { name: "Claude staging" });
    const id = crypto.randomUUID();
    mockDb.query.messageBanks.findFirst.mockResolvedValueOnce(undefined);

    const res = await apiKeyRequest(app, token, "PUT", `/admin/message-banks/${id}?secret=x`, validBank, {
      "x-real-ip": "198.51.100.7",
      "x-request-id": "req-123",
    });
    expect(res.status).toBe(404);

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      actor_type: "api_key",
      actor_id: row.id,
      actor_name: "Claude staging",
      method: "PUT",
      path: `/admin/message-banks/${id}`,
      params: { id },
      status: 404,
      ip: "198.51.100.7",
      request_id: "req-123",
    });
  });

  it("records a scope refusal (403) for a known key", async () => {
    const { token, row } = createTestApiKey(["routes:read"]);
    const res = await apiKeyRequest(app, token, "POST", "/admin/message-banks", validBank);
    expect(res.status).toBe(403);
    expect(auditRows).toEqual([
      expect.objectContaining({ actor_id: row.id, status: 403, method: "POST" }),
    ]);
  });

  it("writes nothing for GETs", async () => {
    const { token } = createTestApiKey(["images:read"]);
    await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
    await adminRequest(app, "GET", "/admin/route-images/leeds-town-hall");
    expect(auditRows).toHaveLength(0);
    expect(mockDb.insert).not.toHaveBeenCalledWith(adminAuditLog);
  });

  it("writes nothing when authentication fails", async () => {
    const res = await jsonRequest(app, "POST", "/admin/message-banks", validBank, {
      Authorization: "Bearer crk_dev_nonsense",
    });
    expect(res.status).toBe(401);
    expect(auditRows).toHaveLength(0);
  });

  it("writes nothing for 5xx responses", async () => {
    mockDb.returning.mockImplementationOnce(() => {
      throw new Error("db exploded");
    });
    const res = await adminRequest(app, "POST", "/admin/message-banks", validBank);
    expect(res.status).toBe(500);
    expect(auditRows).toHaveLength(0);
  });

  it("never fails the request when the audit write fails", async () => {
    auditValues.mockRejectedValue(new Error("audit table missing"));
    mockDb.returning.mockReturnValueOnce([mockMessageBank()]);

    const res = await adminRequest(app, "POST", "/admin/message-banks", validBank);
    expect(res.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("failed to write admin audit log"),
    );
  });
});

describe("audit path scrubbing", () => {
  it("drops the query string", () => {
    expect(scrubAuditPath("/admin/routes?token=abc&x=1")).toBe("/admin/routes");
  });

  it("redacts event codes but keeps event UUIDs", () => {
    const id = "5b0c3f8e-2a4d-4c1e-9f7a-0123456789ab";
    expect(scrubAuditPath(`/admin/events/${id}/refund`)).toBe(`/admin/events/${id}/refund`);
    expect(scrubAuditPath("/event/abcd2345/join")).toBe("/event/[redacted]/join");
  });

  it("redacts API key tokens anywhere in the path", () => {
    expect(scrubAuditPath("/admin/crk_dev_abc_def")).toBe("/admin/[redacted]");
  });

  it("redacts credential-like route params", () => {
    expect(scrubAuditParams({ id: "x", code: "abcd2345", token: "t" })).toEqual({
      id: "x",
      code: "[redacted]",
      token: "[redacted]",
    });
    expect(scrubAuditParams({})).toBeNull();
  });
});
