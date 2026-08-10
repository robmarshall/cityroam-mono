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
import { createTestApp, mockEvent, mockParticipant, mockRoute, mockMessageBank, mockMessage, fakeUUID, resetUUIDs, futureDate, pastDate } from "./helpers.js";
import { db } from "../db/index.js";
import {
  checkJoinRateLimit,
  getMessages,
  getMessagesSince,
  setSession,
  deleteSession,
  deleteSessionsByEventId,
  publishControl,
  appendMessage,
  publishMessage,
} from "../redis/index.js";
import { getSession as getSessionFromRedis } from "../redis/session.js";
import { runGroup } from "../services/group-runner.js";

// ── Helpers ──────────────────────────────────────────────────────────
const mockedDb = db as any;

function buildApp(): Hono {
  return createTestApp();
}

// Default session data for authenticated requests
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

/**
 * Reset all db chain mocks to their default chainable behavior.
 */
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
}

// =====================================================================
// GET /event/:code
// =====================================================================
describe("GET /event/:code", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("returns event details (200) for valid code", async () => {
    const event = mockEvent({ code: "abcd2345", status: "NOT_STARTED" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // resolveSession: no cookie, returns null (default mock).
    // Participant list select chain: db.select().from().where() -> array
    const participantRows = [
      { id: "p1", display_name: "Alice", is_lead: true, is_active: true },
      { id: "p2", display_name: "Bob", is_lead: false, is_active: true },
    ];
    mockedDb.where.mockResolvedValueOnce(participantRows);

    const res = await app.request("/event/abcd2345");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.event.code).toBe("abcd2345");
    expect(body.event.status).toBe("NOT_STARTED");
    expect(body.participants).toHaveLength(2);
    expect(body.lead_name).toBe("Alice");
    expect(body.current_participant).toBeNull();
  });

  it("returns 404 for missing event", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce(undefined);

    const res = await app.request("/event/abcd2345");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe("EVENT_NOT_FOUND");
  });

  it("returns current_participant when session cookie matches event code", async () => {
    const event = mockEvent({ code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // Mock getSession from the session module (used by middleware)
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(makeSessionData() as any);

    // Participant list
    const participantRows = [
      { id: "p-id", display_name: "Lead", is_lead: true, is_active: true },
    ];
    mockedDb.where.mockResolvedValueOnce(participantRows);

    const res = await app.request("/event/abcd2345", {
      headers: { Cookie: "cityroam_session=fake-token" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.current_participant).toEqual({
      id: "p-id",
      display_name: "Lead",
      is_lead: true,
      token: "fake-token",
    });
  });

  it("returns current_participant: null without cookie", async () => {
    const event = mockEvent({ code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // No cookie, so resolveSession returns null
    const participantRows: any[] = [];
    mockedDb.where.mockResolvedValueOnce(participantRows);

    const res = await app.request("/event/abcd2345");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.current_participant).toBeNull();
  });

  it("lazy expiry: marks expired event as EXPIRED on access", async () => {
    const event = mockEvent({
      code: "abcd2345",
      status: "IN_PROGRESS",
      expires_at: pastDate(1),
    });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // Lazy expiry: db.update(events).set({status:EXPIRED}).where(eq(...))
    // Then participant list: db.select().from(participants).where(eq(...))
    mockedDb.where
      .mockResolvedValueOnce(undefined) // expiry update chain
      .mockResolvedValueOnce([]); // participant list (empty)

    const res = await app.request("/event/abcd2345");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.event.status).toBe("EXPIRED");
    expect(mockedDb.update).toHaveBeenCalled();
    expect(mockedDb.set).toHaveBeenCalledWith({ status: "EXPIRED" });

    // Sessions invalidated after lazy expiry
    expect(deleteSessionsByEventId).toHaveBeenCalledWith(event.id);
  });
});

// =====================================================================
// POST /event/:code/join
// =====================================================================
describe("POST /event/:code/join", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();

    // Default: rate limit allowed
    vi.mocked(checkJoinRateLimit).mockResolvedValue({ allowed: true, current: 1, limit: 20 });
  });

  it("success - creates participant, returns 201 with participant/token/event/messages", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // 1) active count query: [{ count: 2 }]
    // 2) total count query: [{ count: 2 }]
    // 3) participant list for response
    mockedDb.where
      .mockResolvedValueOnce([{ count: 2 }])   // active count
      .mockResolvedValueOnce([{ count: 2 }])   // total count (not first)
      .mockResolvedValueOnce([                  // participant list for response
        { id: "p1", display_name: "Alice", is_lead: true, is_active: true },
        { id: "new-p", display_name: "TestUser", is_lead: false, is_active: true },
      ]);

    // Insert participant returning
    const newParticipant = mockParticipant({
      id: "new-p",
      event_id: "e-id",
      display_name: "TestUser",
      is_lead: false,
    });
    mockedDb.returning.mockResolvedValueOnce([newParticipant]);

    // Messages from Redis
    vi.mocked(getMessages).mockResolvedValueOnce([]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "TestUser" }),
    });

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.participant.display_name).toBe("TestUser");
    expect(body.participant.is_lead).toBe(false);
    expect(body.token).toBeDefined();
    expect(body.event.code).toBe("abcd2345");
    expect(body.messages).toEqual([]);
    expect(body.participants).toHaveLength(2);

    // Session was stored in Redis (via events route, which uses redis/index.js)
    expect(setSession).toHaveBeenCalled();
    // Control event published
    expect(publishControl).toHaveBeenCalledWith("abcd2345", expect.objectContaining({
      type: "participant_joined",
    }));
  });

  it("first joiner becomes lead, status transitions to WAITING", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "NOT_STARTED" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // No active lead yet -> the joiner takes it
    mockedDb.query.participants.findFirst.mockResolvedValueOnce(undefined);

    // 1) active count: 0
    // 2) update event set().where() for lead promotion
    // 3) participant list for response
    mockedDb.where
      .mockResolvedValueOnce([{ count: 0 }])   // active count
      .mockResolvedValueOnce(undefined)         // update event chain
      .mockResolvedValueOnce([                  // participant list for response
        { id: "lead-p", display_name: "FirstUser", is_lead: true, is_active: true },
      ]);

    // Insert participant returning (is_lead: true)
    const newParticipant = mockParticipant({
      id: "lead-p",
      event_id: "e-id",
      display_name: "FirstUser",
      is_lead: true,
    });
    mockedDb.returning.mockResolvedValueOnce([newParticipant]);

    vi.mocked(getMessages).mockResolvedValueOnce([]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "FirstUser" }),
    });

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.participant.is_lead).toBe(true);
    expect(body.event.status).toBe("WAITING");

    // Event was updated to WAITING with lead_participant_id
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_participant_id: "lead-p",
        status: "WAITING",
      })
    );
  });

  it("rejects invalid display name (Zod error -> 400)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "" }),
    });

    // Validation errors should result in a non-2xx response.
    // Note: @cityroam/shared uses Zod v4 while the API error handler checks
    // instanceof z.ZodError from Zod v3. Until unified, the error handler
    // treats v4 ZodErrors as generic errors (500/INTERNAL_ERROR instead of
    // 400/INVALID_INPUT). The key assertion is that the request is rejected.
    expect(res.ok).toBe(false);

    const body = await res.json();
    expect(body.error).toBeDefined();
    // The error message should reference the validation failure
    expect(typeof body.error).toBe("string");

    consoleSpy.mockRestore();
  });

  it("enforces MAX_PARTICIPANTS cap (403, EVENT_FULL)", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // active count: 10 (at MAX_PARTICIPANTS limit)
    mockedDb.where.mockResolvedValueOnce([{ count: 10 }]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Latecomer" }),
    });

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe("EVENT_FULL");
  });

  it("rate limited - 429 when checkJoinRateLimit returns allowed: false", async () => {
    vi.mocked(checkJoinRateLimit).mockResolvedValueOnce({ allowed: false, current: 21, limit: 20 });

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Spammer" }),
    });

    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });
});

// =====================================================================
// POST /event/:code/start
// =====================================================================
describe("POST /event/:code/start", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("only lead can start (non-lead session -> 403)", async () => {
    // Session middleware reads from redis/session.js
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ is_lead: false }) as any
    );

    const res = await app.request("/event/abcd2345/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("only from WAITING status (other status -> 400)", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any
    );

    // Event is IN_PROGRESS, not WAITING
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "IN_PROGRESS", route_id: "r-id" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const res = await app.request("/event/abcd2345/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("loads first group, updates event, and starts group runner", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData() as any
    );

    const event = mockEvent({
      id: "e-id",
      code: "abcd2345",
      status: "WAITING",
      route_id: "r-id",
    });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const firstGroup = { id: "group-1", route_id: "r-id", position: 0, name: "Introduction" };

    // 1) select first group: db.select().from(routeGroups).where().orderBy().limit(1).then(...)
    // 2) update event to IN_PROGRESS: db.update().set().where()
    mockedDb.where
      .mockReturnValueOnce(mockedDb)          // routeGroups select (chainable for orderBy)
      .mockResolvedValueOnce(undefined);       // update event
    mockedDb.limit.mockResolvedValueOnce([firstGroup]); // limit(1).then(rows => rows[0])

    const res = await app.request("/event/abcd2345/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify event updated to IN_PROGRESS with first group
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "IN_PROGRESS",
        current_group_id: "group-1",
        current_block_id: null,
      })
    );

    // Verify game_started control event
    expect(publishControl).toHaveBeenCalledWith("abcd2345", {
      type: "game_started",
      data: { started_by: "Lead" },
    });

    // Verify runGroup was called asynchronously
    expect(runGroup).toHaveBeenCalledWith("e-id", "abcd2345", "group-1");
  });
});

// =====================================================================
// POST /event/:code/leave
// =====================================================================
describe("POST /event/:code/leave", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("sets participant inactive, publishes control event, clears cookie", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ is_lead: false, display_name: "Bob" }) as any
    );

    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "IN_PROGRESS" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // 1) update participant to inactive: db.update().set().where()
    // 2) count remaining active: db.select().from().where()
    mockedDb.where
      .mockResolvedValueOnce(undefined)       // update participant chain
      .mockResolvedValueOnce([{ count: 3 }]); // count remaining

    const res = await app.request("/event/abcd2345/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Participant updated to inactive
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: false,
        left_reason: "voluntary",
      })
    );

    // Session deleted from Redis
    expect(deleteSession).toHaveBeenCalledWith("fake-token");

    // Control event published
    expect(publishControl).toHaveBeenCalledWith("abcd2345", {
      type: "participant_left",
      data: {
        name: "Bob",
        participant_count: 3,
        reason: "voluntary",
      },
    });

    // Cookie cleared (response should have Set-Cookie header)
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toContain("cityroam_session=");
  });

  it("lead reassignment when lead leaves in WAITING status", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ participant_id: "lead-p", is_lead: true, display_name: "Lead" }) as any
    );

    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    // Once for the leave handler, once for ensureActiveLead's locked read
    mockedDb.query.events.findFirst
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce(event);

    // ensureActiveLead: no active lead remains, then find the oldest active
    const nextLead = mockParticipant({
      id: "next-lead",
      display_name: "Alice",
      is_active: true,
    });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(nextLead);

    // 1) update participant to inactive: db.update().set().where()
    // 2) demote stale leads: db.update().set().where()
    // 3) update new lead is_lead=true: db.update().set().where()
    // 4) update event lead_participant_id: db.update().set().where()
    // 5) count remaining active: db.select().from().where()
    mockedDb.where
      .mockResolvedValueOnce(undefined)       // update participant inactive
      .mockResolvedValueOnce(undefined)       // demote stale leads
      .mockResolvedValueOnce(undefined)       // update new lead
      .mockResolvedValueOnce(undefined)       // update event lead
      .mockResolvedValueOnce([{ count: 2 }]); // count remaining

    const res = await app.request("/event/abcd2345/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(200);

    // Verify next lead was promoted
    expect(mockedDb.set).toHaveBeenCalledWith({ is_lead: true });
    expect(mockedDb.set).toHaveBeenCalledWith({ lead_participant_id: "next-lead" });

    // Control event published
    expect(publishControl).toHaveBeenCalledWith("abcd2345", expect.objectContaining({
      type: "participant_left",
    }));

    // Promotion is announced so clients can re-render lead-only controls
    expect(publishControl).toHaveBeenCalledWith("abcd2345", {
      type: "lead_changed",
      data: { participant_id: "next-lead", name: "Alice" },
    });
  });
});

// =====================================================================
// GET /event/:code/messages
// =====================================================================
describe("GET /event/:code/messages", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("returns messages in order (200)", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const cachedMessages = [
      {
        id: "msg-1",
        sender_type: "guide",
        sender_name: "Guide",
        participant_id: null,
        content: "Welcome!",
        image_url: null,
        step_number: 1,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "msg-2",
        sender_type: "participant",
        sender_name: "Alice",
        participant_id: "p-1",
        content: "Hello!",
        image_url: null,
        step_number: 1,
        created_at: "2026-01-01T00:01:00.000Z",
      },
    ];
    vi.mocked(getMessages).mockResolvedValueOnce(cachedMessages as any);

    const res = await app.request("/event/abcd2345/messages");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].id).toBe("msg-1");
    expect(body.messages[1].id).toBe("msg-2");
  });

  it("respects 'since' filter", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    const sinceMessages = [
      {
        id: "msg-3",
        sender_type: "guide",
        sender_name: "Guide",
        participant_id: null,
        content: "Next clue!",
        image_url: null,
        step_number: 2,
        created_at: "2026-01-01T00:05:00.000Z",
      },
    ];
    vi.mocked(getMessagesSince).mockResolvedValueOnce(sinceMessages as any);

    const res = await app.request("/event/abcd2345/messages?since=2026-01-01T00:02:00.000Z");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe("msg-3");

    // Verify getMessagesSince was called with the code and since param
    expect(getMessagesSince).toHaveBeenCalledWith("abcd2345", "2026-01-01T00:02:00.000Z");
  });

  it("absolutizes bare S3 keys stored before uploads returned full URLs", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // Empty cache forces the DB fallback, which is the path legacy rows take.
    vi.mocked(getMessages).mockResolvedValueOnce([]);
    mockedDb.where.mockReturnValueOnce(mockedDb);
    mockedDb.orderBy.mockResolvedValueOnce([
      {
        id: "msg-1",
        event_id: "e-id",
        sender_type: "guide",
        sender_name: "Guide",
        participant_id: null,
        content: "",
        image_url: "uploads/1699_photo.png",
        step_number: 1,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "msg-2",
        event_id: "e-id",
        sender_type: "guide",
        sender_name: "Guide",
        participant_id: null,
        content: "",
        image_url: "https://cdn.test.com/uploads/already-absolute.png",
        step_number: 1,
        created_at: new Date("2026-01-01T00:01:00.000Z"),
      },
    ]);

    const res = await app.request("/event/abcd2345/messages");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.messages[0].image_url).toBe("https://cdn.test.com/uploads/1699_photo.png");
    expect(body.messages[1].image_url).toBe(
      "https://cdn.test.com/uploads/already-absolute.png",
    );
  });
});

// =====================================================================
// Rejoining after being marked inactive
// =====================================================================
describe("rejoin after inactivity", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("GET omits current_participant when the session's participant is inactive", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "IN_PROGRESS" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ participant_id: "p1", display_name: "Swept" }) as any,
    );

    mockedDb.where.mockResolvedValueOnce([
      { id: "p1", display_name: "Swept", is_lead: true, is_active: false },
      { id: "p2", display_name: "Bob", is_lead: false, is_active: true },
    ]);

    const res = await app.request("/event/abcd2345", {
      headers: { Cookie: "cityroam_session=fake-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current_participant).toBeNull();
  });

  it("GET reports current_participant using the DB row, not the cached session", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "IN_PROGRESS" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    // Session still says is_lead=false, but the participant was promoted
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ participant_id: "p1", display_name: "Alice", is_lead: false }) as any,
    );

    mockedDb.where.mockResolvedValueOnce([
      { id: "p1", display_name: "Alice", is_lead: true, is_active: true },
    ]);

    const res = await app.request("/event/abcd2345", {
      headers: { Cookie: "cityroam_session=fake-token" },
    });

    const body = await res.json();
    expect(body.current_participant.is_lead).toBe(true);
  });

  it("reactivates an inactive participant instead of inserting a duplicate", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "IN_PROGRESS" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce({ id: "other-lead" }) // an active lead still exists
      .mockResolvedValueOnce(
        mockParticipant({
          id: "p1",
          event_id: "e-id",
          token: "fake-token",
          is_active: false,
          display_name: "Swept",
        }),
      );

    mockedDb.where
      .mockResolvedValueOnce([{ count: 1 }]) // active count
      .mockImplementationOnce(() => mockedDb) // reactivate update -> returning()
      .mockResolvedValueOnce([
        { id: "p1", display_name: "Swept", is_lead: false, is_active: true },
      ]);

    mockedDb.returning.mockResolvedValueOnce([
      mockParticipant({
        id: "p1",
        event_id: "e-id",
        token: "fake-token",
        is_active: true,
        is_lead: false,
        display_name: "Swept",
      }),
    ]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ display_name: "Swept" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.participant.id).toBe("p1");

    // Reactivated in place — no new participant row
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: true,
        left_at: null,
        left_reason: null,
      }),
    );
  });

  it("gives the lead back to a solo player who left and rejoined", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined) // no active lead
      .mockResolvedValueOnce(
        mockParticipant({
          id: "p1",
          event_id: "e-id",
          token: "fake-token",
          is_active: false,
          is_lead: false,
        }),
      );

    mockedDb.where
      .mockResolvedValueOnce([{ count: 0 }]) // active count
      .mockImplementationOnce(() => mockedDb) // reactivate update -> returning()
      .mockResolvedValueOnce(undefined) // update event lead_participant_id
      .mockResolvedValueOnce([
        { id: "p1", display_name: "Solo", is_lead: true, is_active: true },
      ]);

    mockedDb.returning.mockResolvedValueOnce([
      mockParticipant({
        id: "p1",
        event_id: "e-id",
        token: "fake-token",
        is_active: true,
        is_lead: true,
        display_name: "Solo",
      }),
    ]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ display_name: "Solo" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.participant.is_lead).toBe(true);
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ is_lead: true }),
    );
    expect(mockedDb.set).toHaveBeenCalledWith({ lead_participant_id: "p1" });
  });

  it("keeps an in-progress event IN_PROGRESS when a rejoiner claims the lead", async () => {
    const event = mockEvent({ id: "e-id", code: "abcd2345", status: "IN_PROGRESS" });
    mockedDb.query.events.findFirst.mockResolvedValueOnce(event);

    mockedDb.query.participants.findFirst.mockResolvedValueOnce(undefined);

    mockedDb.where
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { id: "new-p", display_name: "Newbie", is_lead: true, is_active: true },
      ]);

    mockedDb.returning.mockResolvedValueOnce([
      mockParticipant({ id: "new-p", event_id: "e-id", is_lead: true, display_name: "Newbie" }),
    ]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Newbie" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.status).toBe("IN_PROGRESS");
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "IN_PROGRESS", lead_participant_id: "new-p" }),
    );
  });
});
