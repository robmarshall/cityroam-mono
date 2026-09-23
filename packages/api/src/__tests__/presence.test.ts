import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { PARTICIPANT_OFFLINE_TIMEOUT_MS } from "@cityroam/shared/constants";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema/index.js")>(
    "../db/schema/index.js",
  );
  const mockDb: any = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

// ── Mock redis client ───────────────────────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(["0", []]),
  },
}));

vi.mock("../redis/pubsub.js", () => ({
  publishControl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../redis/session.js", () => ({
  deleteSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/lead.js", () => ({
  ensureActiveLead: vi.fn().mockResolvedValue(null),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { publishControl } from "../redis/pubsub.js";
import { deleteSession } from "../redis/session.js";
import { ensureActiveLead } from "../services/lead.js";
import { startPresenceSweep, stopPresenceSweep } from "../ws/presence.js";

const mockedDb = db as any;
const mockedRedis = redis as any;

const SWEPT_PARTICIPANT = {
  id: "p-lead",
  event_id: "e-1",
  display_name: "Lead",
  token: "token-lead",
};

/** Drive one sweep tick with a single stale presence key. */
async function runSweepTick(hasConnection = false): Promise<void> {
  mockedRedis.scan.mockResolvedValueOnce(["0", ["presence:abcd2345:p-lead"]]);
  mockedRedis.get.mockResolvedValueOnce(
    new Date(Date.now() - PARTICIPANT_OFFLINE_TIMEOUT_MS - 1000).toISOString(),
  );
  mockedDb.limit.mockResolvedValueOnce([SWEPT_PARTICIPANT]);
  mockedDb.where
    .mockImplementationOnce(() => mockedDb) // participant lookup
    .mockImplementationOnce(() => mockedDb) // mark inactive
    .mockImplementationOnce(() => [{ value: 1 }]) // remaining active count
    .mockImplementation(() => mockedDb);

  startPresenceSweep(
    () => hasConnection,
    () => ["abcd2345"],
  );

  await vi.advanceTimersByTimeAsync(60_000);
  // Let the sweep's awaited chain settle
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockedDb.limit.mockReset().mockResolvedValue([]);
  mockedDb.where.mockReset().mockImplementation(() => mockedDb);
});

afterEach(() => {
  stopPresenceSweep();
  vi.useRealTimers();
});

describe("presence sweep", () => {
  it("marks a timed-out participant inactive and clears their lead flag", async () => {
    await runSweepTick();

    expect(mockedDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: false,
        is_lead: false,
        left_reason: "timeout",
      }),
    );
  });

  it("deletes the swept participant's Redis session so HTTP stops authenticating them", async () => {
    await runSweepTick();

    expect(deleteSession).toHaveBeenCalledWith("token-lead");
  });

  it("reassigns the lead after sweeping a participant", async () => {
    await runSweepTick();

    expect(ensureActiveLead).toHaveBeenCalledWith("e-1", "abcd2345");
  });

  it("publishes participant_left with reason timeout", async () => {
    await runSweepTick();

    expect(publishControl).toHaveBeenCalledWith(
      "abcd2345",
      expect.objectContaining({
        type: "participant_left",
        data: expect.objectContaining({ reason: "timeout" }),
      }),
    );
  });

  it("leaves a participant alone while they hold a live WS connection", async () => {
    await runSweepTick(true);

    expect(deleteSession).not.toHaveBeenCalled();
    expect(ensureActiveLead).not.toHaveBeenCalled();
  });
});
