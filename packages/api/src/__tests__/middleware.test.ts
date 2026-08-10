import { vi, describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock db module ──────────────────────────────────────────────────
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
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

// ── Mock redis/index.js (barrel re-exports) ─────────────────────────
vi.mock("../redis/index.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  disconnectRedis: vi.fn(),
  setSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(undefined),
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

// ── Mock redis/session.js (used directly by session middleware) ──────
vi.mock("../redis/session.js", () => ({
  getSession: vi.fn().mockResolvedValue(null),
  setSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock redis/client.js ────────────────────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  disconnectRedis: vi.fn(),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../db/index.js";
import { getSession } from "../redis/session.js";
import { setSession } from "../redis/session.js";
import { createTestApp, jsonRequest, getAdminToken } from "./helpers.js";
import { signAdminToken } from "../middleware/admin.js";

// ====================================================================
// Session Auth Middleware
// ====================================================================
describe("Session auth middleware", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("passes auth with a valid cookie and Redis session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      participant_id: "p-1",
      event_id: "e-1",
      event_code: "ABCD1234",
      display_name: "Alice",
      is_lead: true,
    });

    const res = await app.request("/event/ABCD1234/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=valid-token",
      },
    });

    // Should NOT be 401 — the session middleware passed
    expect(res.status).not.toBe(401);
  });

  it("returns 401 when the cookie is missing", async () => {
    const res = await app.request("/event/ABCD1234/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the cookie is present but no session is found", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(db.query.participants.findFirst).mockResolvedValueOnce(
      null as any,
    );

    const res = await app.request("/event/ABCD1234/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=unknown-token",
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("falls back to DB when Redis misses and re-populates session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    // DB fallback: participant found
    vi.mocked(db.query.participants.findFirst).mockResolvedValueOnce({
      id: "p-2",
      event_id: "e-2",
      display_name: "Bob",
      is_lead: false,
      is_active: true,
    } as any);

    // DB fallback: event found
    vi.mocked(db.query.events.findFirst).mockResolvedValueOnce({
      code: "ABCD1234",
    } as any);

    const res = await app.request("/event/ABCD1234/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=db-fallback-token",
      },
    });

    // Should NOT be 401 — auth succeeded via DB fallback
    expect(res.status).not.toBe(401);

    // Session should be re-populated in Redis
    expect(setSession).toHaveBeenCalledWith("db-fallback-token", {
      participant_id: "p-2",
      event_id: "e-2",
      event_code: "ABCD1234",
      display_name: "Bob",
      is_lead: false,
    });
  });

  it("returns 401 for a swept participant once their Redis session is gone", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    vi.mocked(db.query.participants.findFirst).mockResolvedValueOnce({
      id: "p-3",
      event_id: "e-3",
      display_name: "Swept",
      is_lead: true,
      is_active: false,
    } as any);

    const res = await app.request("/event/ABCD1234/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=swept-token",
      },
    });

    expect(res.status).toBe(401);
    expect(setSession).not.toHaveBeenCalled();
  });
});

// ====================================================================
// Admin Auth Middleware
// ====================================================================
describe("Admin auth middleware", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("passes auth with a valid JWT", async () => {
    const token = await signAdminToken("admin");

    const res = await app.request("/admin/dashboard", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Should NOT be 401
    expect(res.status).not.toBe(401);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request("/admin/dashboard", {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 401 for an invalid JWT", async () => {
    const res = await app.request("/admin/dashboard", {
      method: "GET",
      headers: {
        Authorization: "Bearer this-is-not-a-valid-jwt",
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 401 for garbage token (expired simulation)", async () => {
    const res = await app.request("/admin/dashboard", {
      method: "GET",
      headers: {
        Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MCwiZXhwIjoxfQ.invalid",
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("ADMIN_UNAUTHORIZED");
  });
});

// ====================================================================
// CORS Middleware
// ====================================================================
describe("CORS middleware", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("returns CORS headers for an allowed origin", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "https://marketing.test.com" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://marketing.test.com",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("allows localhost origins in development mode", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("returns correct headers for OPTIONS preflight", async () => {
    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.test.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.test.com",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
