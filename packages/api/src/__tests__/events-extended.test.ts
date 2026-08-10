import { vi, describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock db module (must be hoisted before any imports that use db) ──
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      routeGroups: { findFirst: vi.fn() },
      routeBlocks: { findFirst: vi.fn() },
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
    transaction: vi.fn((fn: any) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

// ── Mock redis index module ──────────────────────────────────────────
vi.mock("../redis/index.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  disconnectRedis: vi.fn(),
  setSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  deleteSessionsByEventId: vi.fn().mockResolvedValue(undefined),
  appendMessage: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([]),
  getMessagesSince: vi.fn().mockResolvedValue([]),
  checkJoinRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 20 }),
  checkNameChangeRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 3 }),
  checkGuideRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 1 }),
  checkParticipantRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 10 }),
  publishIncoming: vi.fn().mockResolvedValue(undefined),
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishTyping: vi.fn().mockResolvedValue(undefined),
  publishControl: vi.fn().mockResolvedValue(undefined),
  incomingChannel: vi.fn(),
  messagesChannel: vi.fn(),
  typingChannel: vi.fn(),
  controlChannel: vi.fn(),
  extractEventCode: vi.fn(),
  subscribeToIncomingPattern: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));

// ── Mock redis session module (used by session middleware directly) ───
vi.mock("../redis/session.js", () => ({
  setSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  deleteSessionsByEventId: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock group-runner ────────────────────────────────────────────────
vi.mock("../services/group-runner.js", () => ({
  runGroup: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock redis client (for health check) ─────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  disconnectRedis: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────
import { createTestApp, mockEvent, resetUUIDs } from "./helpers.js";
import { db } from "../db/index.js";
import {
  checkNameChangeRateLimit,
  setSession,
  publishControl,
} from "../redis/index.js";
import { getSession as getSessionFromRedis } from "../redis/session.js";

// ── Helpers ──────────────────────────────────────────────────────────
const mockedDb = db as any;

function buildApp(): Hono {
  return createTestApp();
}

function makeSessionData(overrides: Record<string, unknown> = {}) {
  return {
    participant_id: "p-id",
    event_id: "e-id",
    event_code: "abcd2345",
    display_name: "Lead",
    is_lead: true,
    ...overrides,
  };
}

function resetDbChainMocks(): void {
  mockedDb.select.mockReset().mockImplementation(() => mockedDb);
  mockedDb.from.mockReset().mockImplementation(() => mockedDb);
  mockedDb.where.mockReset().mockResolvedValue([]);
  mockedDb.groupBy.mockReset().mockImplementation(() => mockedDb);
  mockedDb.orderBy.mockReset().mockImplementation(() => mockedDb);
  mockedDb.limit.mockReset().mockImplementation(() => mockedDb);
  mockedDb.offset.mockReset().mockImplementation(() => mockedDb);
  mockedDb.returning.mockReset().mockResolvedValue([]);
  mockedDb.set.mockReset().mockImplementation(() => mockedDb);
  mockedDb.update.mockReset().mockImplementation(() => mockedDb);
  mockedDb.values.mockReset().mockImplementation(() => mockedDb);
  mockedDb.insert.mockReset().mockImplementation(() => mockedDb);
  mockedDb.delete.mockReset().mockImplementation(() => mockedDb);
  mockedDb.execute.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  mockedDb.transaction.mockReset().mockImplementation((fn: any) => fn(mockedDb));
  mockedDb.query.events.findFirst.mockReset();
  mockedDb.query.participants.findFirst.mockReset();
}

/**
 * resolveSession's Redis fast path re-reads the participant row to confirm
 * they're still active, so any test with a session must queue that row first.
 */
function mockSessionParticipant(overrides: Record<string, unknown> = {}): void {
  mockedDb.query.participants.findFirst.mockResolvedValueOnce({
    is_active: true,
    is_lead: true,
    ...overrides,
  });
}

// =====================================================================
// POST /event/:code/name
// =====================================================================
describe("POST /event/:code/name", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("success: updates name, returns {success, display_name}", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // Rate limit allowed (default mock)
    // db.update(participants).set().where() for name change
    mockedDb.where.mockResolvedValueOnce(undefined);

    const res = await app.request("/event/abcd2345/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ name: "NewName" }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.display_name).toBe("NewName");

    // DB was updated
    expect(mockedDb.update).toHaveBeenCalled();
    expect(mockedDb.set).toHaveBeenCalledWith({ display_name: "NewName" });

    // Session was updated in Redis
    expect(setSession).toHaveBeenCalledWith(
      "fake-token",
      expect.objectContaining({ display_name: "NewName" }),
    );

    // Control event published
    expect(publishControl).toHaveBeenCalledWith("abcd2345", {
      type: "name_changed",
      data: {
        participant_id: "p-id",
        old_name: "Lead",
        new_name: "NewName",
      },
    });
  });

  it("rate limited: returns 429", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    vi.mocked(checkNameChangeRateLimit).mockResolvedValueOnce({
      allowed: false,
      current: 4,
      limit: 3,
    });

    const res = await app.request("/event/abcd2345/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ name: "NewName" }),
    });

    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("session mismatch: returns 403", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ event_code: "other999" }) as any,
    );
    mockSessionParticipant();

    const res = await app.request("/event/abcd2345/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ name: "NewName" }),
    });

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("terminal event: returns 410", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "COMPLETED" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const res = await app.request("/event/abcd2345/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ name: "NewName" }),
    });

    expect(res.status).toBe(410);

    const body = await res.json();
    expect(body.code).toBe("EVENT_COMPLETED");
  });

  it("same name: returns success without DB update", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ display_name: "Lead" }) as any,
    );
    mockSessionParticipant();

    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const res = await app.request("/event/abcd2345/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ name: "Lead" }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.display_name).toBe("Lead");

    // No DB update since name didn't change
    expect(mockedDb.update).not.toHaveBeenCalled();
    // No rate limit check since name didn't change
    expect(checkNameChangeRateLimit).not.toHaveBeenCalled();
  });
});

// =====================================================================
// PUT /event/:code/language
// =====================================================================
describe("PUT /event/:code/language", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("success: updates language and route_id", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const event = mockEvent({
      id: "e-id",
      code: "abcd2345",
      status: "WAITING",
      route_family_id: "family-1",
    });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // Route variant lookup
    const variant = { id: "route-es", language: "es", is_active: true };
    mockedDb.query.routes.findFirst.mockResolvedValueOnce(variant);

    // db.update(events).set().where() for language change
    mockedDb.where.mockResolvedValueOnce(undefined);

    const res = await app.request("/event/abcd2345/language", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ language: "es" }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.language).toBe("es");
    expect(body.route_id).toBe("route-es");

    // DB was updated
    expect(mockedDb.set).toHaveBeenCalledWith({
      language: "es",
      route_id: "route-es",
    });

    // Control event published
    expect(publishControl).toHaveBeenCalledWith("abcd2345", {
      type: "language_changed",
      data: { language: "es" },
    });
  });

  it("non-lead: returns 403", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ is_lead: false }) as any,
    );
    mockSessionParticipant({ is_lead: false });

    const res = await app.request("/event/abcd2345/language", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ language: "es" }),
    });

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("unsupported language: returns 400", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const res = await app.request("/event/abcd2345/language", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ language: "xx" }),
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("game already started (IN_PROGRESS): returns 400", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const event = mockEvent({
      id: "e-id",
      code: "abcd2345",
      status: "IN_PROGRESS",
      route_family_id: "family-1",
    });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const res = await app.request("/event/abcd2345/language", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ language: "es" }),
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("no route variant available: returns 404", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any,
    );
    mockSessionParticipant();

    const event = mockEvent({
      id: "e-id",
      code: "abcd2345",
      status: "WAITING",
      route_family_id: "family-1",
    });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // No variant found
    mockedDb.query.routes.findFirst.mockResolvedValueOnce(undefined);

    const res = await app.request("/event/abcd2345/language", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ language: "fr" }),
    });

    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe("ROUTE_NOT_FOUND");
  });
});
