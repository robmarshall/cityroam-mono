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

// ── Mock lead election ───────────────────────────────────────────────
vi.mock("../services/lead.js", () => ({
  ensureActiveLead: vi.fn().mockResolvedValue(null),
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
import { createTestApp, mockEvent, mockParticipant, resetUUIDs } from "./helpers.js";
import { db } from "../db/index.js";
import { getSession as getSessionFromRedis } from "../redis/session.js";
import { ensureActiveLead } from "../services/lead.js";

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

/** resolveSession's Redis fast path re-reads the participant row. */
function mockSessionParticipant(overrides: Record<string, unknown> = {}): void {
  mockedDb.query.participants.findFirst.mockResolvedValueOnce({
    is_active: true,
    is_lead: true,
    ...overrides,
  });
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

// The headers a browser attaches to the player app's own fetch: the app is on
// app.test.com, the API on another host under the same site.
const APP_HEADERS = {
  Origin: "https://app.test.com",
  "Sec-Fetch-Site": "same-site",
};

// =====================================================================
// CSRF guard
// =====================================================================
describe("CSRF guard on session-authenticated writes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  /** Sets up a successful leave: the cheapest state-changing lead action. */
  function primeLeave() {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(makeSessionData() as any);
    mockSessionParticipant();
    mockedDb.query.events.findFirst.mockResolvedValueOnce(
      mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" }),
    );
    mockedDb.where
      .mockResolvedValueOnce(undefined) // participant update
      .mockResolvedValueOnce([{ count: 0 }]); // remaining active count
  }

  it("accepts the player app's own request (trusted origin, JSON, no body)", async () => {
    primeLeave();

    const res = await app.request("/event/abcd2345/leave", {
      method: "POST",
      headers: {
        ...APP_HEADERS,
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(200);
  });

  it("accepts a JSON body with a charset parameter", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(makeSessionData() as any);
    mockSessionParticipant();
    mockedDb.query.events.findFirst.mockResolvedValueOnce(
      mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" }),
    );

    const res = await app.request("/event/abcd2345/name", {
      method: "POST",
      headers: {
        ...APP_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ name: "Lead" }),
    });

    // Same name short-circuits, but it got past the guard
    expect(res.status).toBe(200);
  });

  it("rejects a start driven from an untrusted origin", async () => {
    const res = await app.request("/event/abcd2345/start", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CSRF_REJECTED");
    // Rejected before any session or event lookup
    expect(getSessionFromRedis).not.toHaveBeenCalled();
    expect(mockedDb.query.events.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a cross-site request that omits the Origin header", async () => {
    const res = await app.request("/event/abcd2345/leave", {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "cross-site",
        Cookie: "cityroam_session=fake-token",
      },
    });

    expect(res.status).toBe(403);
  });

  it("rejects an auto-submitted HTML form", async () => {
    const res = await app.request("/event/abcd2345/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "cityroam_session=fake-token",
      },
      body: "x=1",
    });

    expect(res.status).toBe(403);
  });

  it("rejects a text/plain form post, the other simple-request enctype", async () => {
    const res = await app.request("/event/abcd2345/leave", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Cookie: "cityroam_session=fake-token",
      },
      body: "{}",
    });

    expect(res.status).toBe(403);
  });

  it("lets a header-less client through — it cannot be a browser forgery", async () => {
    primeLeave();

    const res = await app.request("/event/abcd2345/leave", {
      method: "POST",
      headers: { Cookie: "cityroam_session=fake-token" },
    });

    expect(res.status).toBe(200);
  });

  it("leaves GET requests alone", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce(
      mockEvent({ code: "abcd2345", status: "WAITING" }),
    );

    const res = await app.request("/event/abcd2345", {
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    });

    expect(res.status).toBe(200);
  });
});

// =====================================================================
// Transcript and roster confidentiality
// =====================================================================
describe("GET /event/:code/messages authorization", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("refuses the transcript to a caller holding only the event code", async () => {
    const res = await app.request("/event/abcd2345/messages");

    expect(res.status).toBe(401);
    expect(mockedDb.query.events.findFirst).not.toHaveBeenCalled();
  });

  it("refuses the transcript to a participant of a different event", async () => {
    vi.mocked(getSessionFromRedis).mockResolvedValueOnce(
      makeSessionData({ event_code: "zzzz9999" }) as any,
    );
    mockSessionParticipant();

    const res = await app.request("/event/abcd2345/messages", {
      headers: { Cookie: "cityroam_session=fake-token" },
    });

    expect(res.status).toBe(403);
    expect(mockedDb.query.events.findFirst).not.toHaveBeenCalled();
  });
});

// =====================================================================
// Duplicate join
// =====================================================================
describe("POST /event/:code/join idempotency", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUIDs();
    resetDbChainMocks();
    app = buildApp();
  });

  it("reuses the caller's active row instead of orphaning it, keeping the lead", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce(
      mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" }),
    );

    const existing = mockParticipant({
      id: "p1",
      event_id: "e-id",
      token: "fake-token",
      is_active: true,
      is_lead: true,
      display_name: "Lead",
    });

    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(existing) // the cookie's row
      .mockResolvedValueOnce({ id: "p1" }); // the active lead is that same row

    mockedDb.where
      .mockResolvedValueOnce([{ count: 1 }]) // active count (the caller's own row)
      .mockImplementationOnce(() => mockedDb) // participant update -> returning()
      .mockResolvedValueOnce(undefined) // event lead pointer update
      .mockResolvedValueOnce([
        { id: "p1", display_name: "Lead", is_lead: true, is_active: true },
      ]) // roster
      .mockResolvedValueOnce([{ language: "en" }]); // language variants

    mockedDb.returning.mockResolvedValueOnce([existing]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: {
        ...APP_HEADERS,
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ display_name: "Lead" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.participant.id).toBe("p1");
    expect(body.participant.is_lead).toBe(true);
    // Same token — the cookie is not repointed at a second row
    expect(body.token).toBe("fake-token");
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it("does not count the caller's own seat when checking for a full event", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce(
      mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" }),
    );

    const existing = mockParticipant({
      id: "p1",
      event_id: "e-id",
      token: "fake-token",
      is_active: true,
      is_lead: false,
    });

    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ id: "other-lead" });

    mockedDb.where
      .mockResolvedValueOnce([{ count: 10 }]) // MAX_PARTICIPANTS, including the caller
      .mockImplementationOnce(() => mockedDb)
      .mockResolvedValueOnce([
        { id: "p1", display_name: "Lead", is_lead: false, is_active: true },
      ])
      .mockResolvedValueOnce([{ language: "en" }]);

    mockedDb.returning.mockResolvedValueOnce([existing]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: {
        ...APP_HEADERS,
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ display_name: "Lead" }),
    });

    expect(res.status).toBe(201);
  });

  it("retires the cookie's row in another event before repointing it", async () => {
    mockedDb.query.events.findFirst
      .mockResolvedValueOnce(mockEvent({ id: "e-id", code: "abcd2345", status: "WAITING" }))
      .mockResolvedValueOnce({ id: "other-id", code: "zzzz9999" });

    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(
        mockParticipant({
          id: "old-p",
          event_id: "other-id",
          token: "fake-token",
          is_active: true,
          is_lead: true,
        }),
      ) // still active, but in a different hunt
      .mockResolvedValueOnce(undefined); // this event has no lead

    mockedDb.where
      .mockResolvedValueOnce([{ count: 0 }]) // active count
      .mockResolvedValueOnce(undefined) // deactivate the old row
      .mockResolvedValueOnce(undefined) // event lead pointer update
      .mockResolvedValueOnce([
        { id: "new-p", display_name: "Switcher", is_lead: true, is_active: true },
      ])
      .mockResolvedValueOnce([{ language: "en" }]);

    mockedDb.returning.mockResolvedValueOnce([
      mockParticipant({
        id: "new-p",
        event_id: "e-id",
        is_active: true,
        is_lead: true,
        display_name: "Switcher",
      }),
    ]);

    const res = await app.request("/event/abcd2345/join", {
      method: "POST",
      headers: {
        ...APP_HEADERS,
        "Content-Type": "application/json",
        Cookie: "cityroam_session=fake-token",
      },
      body: JSON.stringify({ display_name: "Switcher" }),
    });

    expect(res.status).toBe(201);
    expect(mockedDb.insert).toHaveBeenCalled();
    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: false,
        is_lead: false,
        left_reason: "voluntary",
      }),
    );
    // The abandoned hunt gets a fresh lead election
    expect(ensureActiveLead).toHaveBeenCalledWith("other-id", "zzzz9999");
  });
});
