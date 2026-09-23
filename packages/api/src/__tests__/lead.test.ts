import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema/index.js")>(
    "../db/schema/index.js",
  );
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn().mockResolvedValue([]),
    limit: vi.fn(() => mockDb),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    returning: vi.fn().mockResolvedValue([]),
    transaction: vi.fn((fn: any) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

// ── Mock redis ──────────────────────────────────────────────────────
vi.mock("../redis/index.js", () => ({
  setSession: vi.fn().mockResolvedValue(undefined),
  publishControl: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../db/index.js";
import { setSession, publishControl } from "../redis/index.js";
import { ensureActiveLead } from "../services/lead.js";

const mockedDb = db as any;

function participantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-next",
    token: "token-next",
    display_name: "Alice",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.where.mockReset().mockResolvedValue([]);
  mockedDb.set.mockReset().mockImplementation(() => mockedDb);
  mockedDb.update.mockReset().mockImplementation(() => mockedDb);
  mockedDb.transaction.mockReset().mockImplementation((fn: any) => fn(mockedDb));
  mockedDb.execute.mockReset().mockResolvedValue([]);
});

describe("ensureActiveLead", () => {
  it("promotes the oldest active participant when no active lead remains", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined) // no active lead
      .mockResolvedValueOnce(participantRow());

    const result = await ensureActiveLead("e-1", "abcd2345");

    expect(result).toEqual({ participant_id: "p-next", display_name: "Alice" });
    expect(mockedDb.set).toHaveBeenCalledWith({ is_lead: true });
    expect(mockedDb.set).toHaveBeenCalledWith({ lead_participant_id: "p-next" });
  });

  it("refreshes the promoted participant's Redis session with is_lead true", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(participantRow());

    await ensureActiveLead("e-1", "abcd2345");

    expect(setSession).toHaveBeenCalledWith("token-next", {
      participant_id: "p-next",
      event_id: "e-1",
      event_code: "abcd2345",
      display_name: "Alice",
      is_lead: true,
    });
  });

  it("publishes a lead_changed control event", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(participantRow({ id: "p-2", display_name: "Bob" }));

    await ensureActiveLead("e-1", "abcd2345");

    expect(publishControl).toHaveBeenCalledWith("abcd2345", {
      type: "lead_changed",
      data: { participant_id: "p-2", name: "Bob" },
    });
  });

  it("promotes in WAITING status too", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "WAITING" });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(participantRow());

    const result = await ensureActiveLead("e-1", "abcd2345");

    expect(result).not.toBeNull();
  });

  it("is a no-op when an active lead still exists", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    mockedDb.query.participants.findFirst.mockResolvedValueOnce({ id: "p-lead" });

    const result = await ensureActiveLead("e-1", "abcd2345");

    expect(result).toBeNull();
    expect(setSession).not.toHaveBeenCalled();
    expect(publishControl).not.toHaveBeenCalled();
  });

  it("clears lead_participant_id when nobody active is left", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await ensureActiveLead("e-1", "abcd2345");

    expect(result).toBeNull();
    expect(mockedDb.set).toHaveBeenCalledWith({ lead_participant_id: null });
    expect(publishControl).not.toHaveBeenCalled();
  });

  it("does nothing for a terminal event", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "COMPLETED" });

    const result = await ensureActiveLead("e-1", "abcd2345");

    expect(result).toBeNull();
    expect(mockedDb.query.participants.findFirst).not.toHaveBeenCalled();
    expect(publishControl).not.toHaveBeenCalled();
  });

  it("still announces the promotion when the session refresh fails", async () => {
    mockedDb.query.events.findFirst.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    mockedDb.query.participants.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(participantRow());
    vi.mocked(setSession).mockRejectedValueOnce(new Error("redis down"));

    const result = await ensureActiveLead("e-1", "abcd2345");

    expect(result).not.toBeNull();
    expect(publishControl).toHaveBeenCalledWith(
      "abcd2345",
      expect.objectContaining({ type: "lead_changed" }),
    );
  });
});
