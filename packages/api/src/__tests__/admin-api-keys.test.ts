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
import { env } from "../env.js";
import { adminApiKeys, adminAuditLog } from "../db/schema/index.js";
import { hashApiKeySecret, parseApiKey } from "../lib/api-keys.js";
import { ADMIN_API_KEY_GRANTABLE_SCOPES } from "@cityroam/shared/constants";
import {
  createTestApp,
  adminRequest,
  apiKeyRequest,
  createTestApiKey,
} from "./helpers.js";

const mockDb = db as any;
let app: Hono;
let auditRows: any[];

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    name: "Claude staging",
    prefix: "crk_dev_0000000000000000000001",
    token_hash: "f".repeat(64),
    last4: "abcd",
    scopes: ["routes:read"],
    created_by: "admin",
    created_at: new Date("2026-09-01T10:00:00Z"),
    expires_at: null,
    last_used_at: null,
    last_used_ip: null,
    revoked_at: null,
    revoked_by: null,
    ...overrides,
  };
}

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    created_at: new Date("2026-09-20T10:00:00Z"),
    actor_type: "api_key",
    actor_id: "key-1",
    actor_name: "Claude staging",
    method: "PUT",
    path: "/admin/blocks/abc",
    params: { blockId: "abc" },
    status: 200,
    ip: "198.51.100.7",
    request_id: null,
    ...overrides,
  };
}

/** Makes insert(adminApiKeys).values(v).returning() echo the row it was given. */
function echoInsertedKey() {
  let inserted: any;
  mockDb.insert.mockImplementation((table: unknown) => {
    if (table === adminAuditLog) {
      return { values: async (row: any) => void auditRows.push(row) };
    }
    return {
      values: (v: any) => {
        inserted = v;
        return {
          returning: async () => [
            keyRow({ ...v, created_at: new Date(), last_used_at: null, revoked_at: null }),
          ],
        };
      },
    };
  });
  return () => inserted;
}

beforeEach(() => {
  auditRows = [];
  for (const m of ["select", "from", "where", "orderBy", "limit", "offset", "values", "update", "set", "delete"]) {
    mockDb[m].mockReset().mockImplementation(() => db);
  }
  mockDb.returning.mockReset().mockReturnValue([]);
  mockDb.insert.mockReset().mockImplementation((table: unknown) =>
    table === adminAuditLog ? { values: async (row: any) => void auditRows.push(row) } : db,
  );
  for (const table of Object.values(mockDb.query) as any[]) {
    table.findFirst.mockReset();
  }
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  app = createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
  (env as any).API_KEY_ENV = "dev";
});

// ────────────────────────────────────────────────────────────────────
// POST /admin/api-keys
// ────────────────────────────────────────────────────────────────────

describe("POST /admin/api-keys", () => {
  it("returns the token once and stores only its hash", async () => {
    const inserted = echoInsertedKey();

    const res = await adminRequest(app, "POST", "/admin/api-keys", {
      name: "Claude staging",
      scopes: ["routes:read", "routes:write"],
      expires_in_days: 90,
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.json();
    const parsed = parseApiKey(body.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.env).toBe("dev");
    expect(parsed!.keyId).toBe(body.api_key.id);

    const stored = inserted();
    expect(stored.token_hash).toBe(hashApiKeySecret(parsed!.secret));
    expect(JSON.stringify(stored)).not.toContain(parsed!.secret);
    expect(stored.last4).toBe(parsed!.secret.slice(-4));
    expect(stored.created_by).toBe("admin");
    expect(stored.scopes).toEqual(["routes:read", "routes:write"]);

    expect(body.api_key).not.toHaveProperty("token_hash");
    expect(body.api_key.prefix).toBe(body.token.slice(0, body.api_key.prefix.length));
    expect(body.api_key.last4).toBe(parsed!.secret.slice(-4));
  });

  it("sets expires_at from expires_in_days, or null for never", async () => {
    const inserted = echoInsertedKey();
    const before = Date.now();
    await adminRequest(app, "POST", "/admin/api-keys", {
      name: "Thirty days",
      scopes: ["routes:read"],
      expires_in_days: 30,
    });
    const expires = inserted().expires_at as Date;
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
    expect(expires.getTime()).toBeLessThan(before + 30 * 86_400_000 + 60_000);

    await adminRequest(app, "POST", "/admin/api-keys", { name: "Forever", scopes: ["routes:read"] });
    expect(inserted().expires_at).toBeNull();
  });

  it("mints a different token every time", async () => {
    echoInsertedKey();
    const a = await (await adminRequest(app, "POST", "/admin/api-keys", { name: "a", scopes: ["routes:read"] })).json();
    const b = await (await adminRequest(app, "POST", "/admin/api-keys", { name: "b", scopes: ["routes:read"] })).json();
    expect(a.token).not.toBe(b.token);
  });

  it("refuses routes:publish", async () => {
    echoInsertedKey();
    const res = await adminRequest(app, "POST", "/admin/api-keys", {
      name: "Publisher",
      scopes: ["routes:read", "routes:publish"],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("routes:publish");
    expect(mockDb.insert).not.toHaveBeenCalledWith(adminApiKeys);
  });

  it("refuses an expiry outside 30/90/365/never", async () => {
    const res = await adminRequest(app, "POST", "/admin/api-keys", {
      name: "Odd",
      scopes: ["routes:read"],
      expires_in_days: 45,
    });
    expect(res.status).toBe(400);
  });

  it("returns a clear error when API_KEY_ENV is not set", async () => {
    (env as any).API_KEY_ENV = "";
    echoInsertedKey();
    const res = await adminRequest(app, "POST", "/admin/api-keys", { name: "x", scopes: ["routes:read"] });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("API_KEY_ENV_UNSET");
    expect(body.error).toContain("API_KEY_ENV");
    expect(mockDb.insert).not.toHaveBeenCalledWith(adminApiKeys);
  });

  it("is audited under the admin session", async () => {
    echoInsertedKey();
    await adminRequest(app, "POST", "/admin/api-keys", { name: "x", scopes: ["routes:read"] });
    expect(auditRows).toEqual([
      expect.objectContaining({ actor_type: "session", actor_id: "admin", path: "/admin/api-keys", status: 201 }),
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /admin/api-keys
// ────────────────────────────────────────────────────────────────────

describe("GET /admin/api-keys", () => {
  it("lists keys without secrets", async () => {
    const rows = [
      keyRow({ name: "Newest", last_used_at: new Date("2026-09-22T09:00:00Z"), last_used_ip: "198.51.100.7" }),
      keyRow({ name: "Revoked", revoked_at: new Date("2026-09-10T00:00:00Z"), revoked_by: "admin" }),
    ];
    mockDb.orderBy.mockResolvedValueOnce(rows);

    const res = await adminRequest(app, "GET", "/admin/api-keys");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.api_keys).toHaveLength(2);
    for (const key of body.api_keys) {
      expect(key).not.toHaveProperty("token_hash");
      expect(key).not.toHaveProperty("token");
      expect(Object.keys(key).sort()).toEqual(
        [
          "created_at", "created_by", "expires_at", "id", "last4", "last_used_at",
          "last_used_ip", "name", "prefix", "revoked_at", "revoked_by", "scopes",
        ].sort(),
      );
    }
    expect(JSON.stringify(body)).not.toContain("f".repeat(64));
    expect(body.api_keys[0]).toMatchObject({
      name: "Newest",
      last_used_at: "2026-09-22T09:00:00.000Z",
      last_used_ip: "198.51.100.7",
    });
    expect(body.api_keys[1].revoked_at).toBe("2026-09-10T00:00:00.000Z");
  });
});

// ────────────────────────────────────────────────────────────────────
// POST /admin/api-keys/:id/revoke
// ────────────────────────────────────────────────────────────────────

describe("POST /admin/api-keys/:id/revoke", () => {
  it("revokes the key, after which it gets 401", async () => {
    const { token, row } = createTestApiKey(["images:read"]);

    const ok = await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
    expect(ok.status).toBe(200);

    mockDb.returning.mockImplementationOnce(() => {
      const setArg = mockDb.set.mock.calls.at(-1)[0];
      Object.assign(row, setArg);
      return [row];
    });

    const res = await adminRequest(app, "POST", `/admin/api-keys/${row.id}/revoke`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.api_key.revoked_at).not.toBeNull();
    expect(body.api_key.revoked_by).toBe("admin");
    expect(mockDb.update).toHaveBeenCalledWith(adminApiKeys);

    // findFirst now resolves to the revoked row.
    const after = await apiKeyRequest(app, token, "GET", "/admin/route-images/leeds-town-hall");
    expect(after.status).toBe(401);
    expect((await after.json()).code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("is idempotent: a revoked key is returned unchanged", async () => {
    const revokedAt = new Date("2026-09-10T00:00:00Z");
    const row = keyRow({ revoked_at: revokedAt, revoked_by: "someone" });
    mockDb.query.adminApiKeys.findFirst.mockResolvedValueOnce(row);

    const res = await adminRequest(app, "POST", `/admin/api-keys/${row.id}/revoke`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.api_key.revoked_at).toBe(revokedAt.toISOString());
    expect(body.api_key.revoked_by).toBe("someone");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown key", async () => {
    mockDb.query.adminApiKeys.findFirst.mockResolvedValueOnce(undefined);
    const res = await adminRequest(app, "POST", `/admin/api-keys/${crypto.randomUUID()}/revoke`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await adminRequest(app, "POST", "/admin/api-keys/not-a-uuid/revoke");
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /admin/audit-log
// ────────────────────────────────────────────────────────────────────

describe("GET /admin/audit-log", () => {
  it("returns entries and the next offset when there is an older page", async () => {
    const rows = [auditRow(), auditRow(), auditRow()];
    mockDb.offset.mockResolvedValueOnce(rows);

    const res = await adminRequest(app, "GET", "/admin/audit-log?actor_id=key-1&limit=2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.next_offset).toBe(2);
    expect(body.entries[0]).toMatchObject({
      actor_type: "api_key",
      actor_id: "key-1",
      method: "PUT",
      path: "/admin/blocks/abc",
      status: 200,
      created_at: "2026-09-20T10:00:00.000Z",
    });
    // limit + 1 rows are fetched to detect the next page; the filter is applied.
    expect(mockDb.limit).toHaveBeenCalledWith(3);
    expect(mockDb.where.mock.calls.at(-1)[0]).toBeDefined();
  });

  it("returns next_offset null on the last page and defaults to 50", async () => {
    mockDb.offset.mockResolvedValueOnce([auditRow()]);
    const res = await adminRequest(app, "GET", "/admin/audit-log?offset=50");
    const body = await res.json();
    expect(body.next_offset).toBeNull();
    expect(mockDb.limit).toHaveBeenCalledWith(51);
    expect(mockDb.offset).toHaveBeenCalledWith(50);
    expect(mockDb.where.mock.calls.at(-1)[0]).toBeUndefined();
  });

  it("rejects a limit above 200", async () => {
    const res = await adminRequest(app, "GET", "/admin/audit-log?limit=500");
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────
// Session-only
// ────────────────────────────────────────────────────────────────────

describe("key management is session-only", () => {
  const calls: Array<[string, string, unknown?]> = [
    ["GET", "/admin/api-keys"],
    ["POST", "/admin/api-keys", { name: "x", scopes: ["routes:read"] }],
    ["POST", `/admin/api-keys/${"00000000-0000-4000-8000-000000000001"}/revoke`],
    ["GET", "/admin/audit-log"],
  ];

  for (const [method, path, body] of calls) {
    it(`${method} ${path} refuses an API key with 403 ADMIN_SESSION_REQUIRED`, async () => {
      const { token } = createTestApiKey([...ADMIN_API_KEY_GRANTABLE_SCOPES]);
      const res = await apiKeyRequest(app, token, method, path, body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("ADMIN_SESSION_REQUIRED");
      expect(mockDb.insert).not.toHaveBeenCalledWith(adminApiKeys);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  }

  it("refuses unauthenticated calls with 401", async () => {
    const res = await app.request("/admin/api-keys");
    expect(res.status).toBe(401);
  });
});
