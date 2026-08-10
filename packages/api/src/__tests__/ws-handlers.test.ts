import { vi, describe, it, expect, beforeEach } from "vitest";
import type { WebSocket } from "ws";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema/index.js")>(
    "../db/schema/index.js",
  );
  const mockDb: any = {
    query: {
      events: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    limit: vi.fn().mockResolvedValue([]),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

// ── Mock redis ──────────────────────────────────────────────────────
vi.mock("../redis/pubsub.js", () => ({
  publishIncoming: vi.fn().mockResolvedValue(undefined),
  publishTyping: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../redis/client.js", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("../services/group-runner.js", () => ({
  advanceAfterBlock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ws/presence.js", () => ({
  updatePresence: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../db/index.js";
import { advanceAfterBlock } from "../services/group-runner.js";
import { handleClientMessage, type SessionInfo } from "../ws/handlers.js";

const mockedDb = db as any;

function makeSocket() {
  const sent: string[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (data: string) => sent.push(data),
  } as unknown as WebSocket;
  return { ws, sent };
}

function parseSent(sent: string[]) {
  return sent.map((s) => JSON.parse(s));
}

/** The session frozen into the socket closure when the connection opened. */
function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    participant_id: "p-1",
    event_id: "evt-1",
    event_code: "ABC123",
    display_name: "Alice",
    is_lead: false,
    ...overrides,
  };
}

function confirmMessage(blockId = "action-block-1") {
  return JSON.stringify({ type: "action_confirm", payload: { block_id: blockId } });
}

/** Queue the participant row the lead check reads. */
function mockLeadRow(isLead: boolean) {
  mockedDb.limit.mockResolvedValueOnce([{ is_lead: isLead }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.limit.mockReset().mockResolvedValue([]);
  mockedDb.where.mockReset().mockImplementation(() => mockedDb);
  mockedDb.select.mockReset().mockImplementation(() => mockedDb);
  mockedDb.from.mockReset().mockImplementation(() => mockedDb);
});

describe("action_confirm", () => {
  it("lets a participant promoted after their socket opened confirm", async () => {
    // Frozen session says they weren't lead when they connected
    const session = makeSession({ is_lead: false });
    // ...but ensureActiveLead has since promoted them
    mockLeadRow(true);
    mockedDb.query.events.findFirst.mockResolvedValueOnce({
      current_block_id: "action-block-1",
    });

    const { ws, sent } = makeSocket();
    await handleClientMessage(ws, confirmMessage(), session);

    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "action-block-1");
    expect(parseSent(sent)).toEqual([]);
  });

  it("refuses a demoted participant even though their session still says lead", async () => {
    // Frozen session is stale in the other direction
    const session = makeSession({ is_lead: true });
    mockLeadRow(false);

    const { ws, sent } = makeSocket();
    await handleClientMessage(ws, confirmMessage(), session);

    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(parseSent(sent)[0]).toMatchObject({
      type: "error",
      payload: { code: "ACTION_LEAD_ONLY" },
    });
  });

  it("refuses when the participant row has gone", async () => {
    const session = makeSession({ is_lead: true });
    mockedDb.limit.mockResolvedValueOnce([]);

    const { ws, sent } = makeSocket();
    await handleClientMessage(ws, confirmMessage(), session);

    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(parseSent(sent)[0]).toMatchObject({
      payload: { code: "ACTION_LEAD_ONLY" },
    });
  });

  it("refuses a block that isn't the one the event is parked on", async () => {
    const session = makeSession({ is_lead: false });
    mockLeadRow(true);
    mockedDb.query.events.findFirst.mockResolvedValueOnce({
      current_block_id: "a-different-block",
    });

    const { ws, sent } = makeSocket();
    await handleClientMessage(ws, confirmMessage(), session);

    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(parseSent(sent)[0]).toMatchObject({
      payload: { code: "ACTION_BLOCK_MISMATCH" },
    });
  });

  it("refuses a confirm with no block_id", async () => {
    const { ws, sent } = makeSocket();
    await handleClientMessage(
      ws,
      JSON.stringify({ type: "action_confirm", payload: {} }),
      makeSession({ is_lead: true }),
    );

    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(parseSent(sent)[0]).toMatchObject({
      payload: { code: "ACTION_MISSING_BLOCK" },
    });
  });

  it("checks the row before the event, so a non-lead costs one query", async () => {
    mockLeadRow(false);

    const { ws } = makeSocket();
    await handleClientMessage(ws, confirmMessage(), makeSession({ is_lead: true }));

    expect(mockedDb.query.events.findFirst).not.toHaveBeenCalled();
  });
});
