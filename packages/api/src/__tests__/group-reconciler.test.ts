import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema/index.js")>(
    "../db/schema/index.js",
  );
  const mockDb: any = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn().mockResolvedValue([]),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

// ── Mock redis client ───────────────────────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

// ── Mock group-runner ───────────────────────────────────────────────
vi.mock("../services/group-runner.js", () => ({
  runGroup: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { runGroup } from "../services/group-runner.js";
import { reconcileStrandedGroups } from "../services/group-reconciler.js";

const mockedDb = db as any;
const mockedRedis = redis as any;

const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);

function strandedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    code: "ABC123",
    current_group_id: "group-2",
    current_block_index: 3,
    started_at: HOUR_AGO,
    ...overrides,
  };
}

/**
 * The reconciler runs two queries per pass: the candidate scan (resolved by
 * `where`) and the last-activity lookup (resolved by `limit`).
 */
function setupScan(
  candidates: Record<string, unknown>[],
  lastMessageAt: Date | null = HOUR_AGO,
) {
  mockedDb.where.mockReturnValueOnce(Promise.resolve(candidates) as any);
  mockedDb.limit.mockResolvedValueOnce(
    lastMessageAt ? [{ created_at: lastMessageAt }] : [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.where.mockReset().mockImplementation(() => mockedDb);
  mockedDb.limit.mockReset().mockResolvedValue([]);
  mockedRedis.set.mockReset().mockResolvedValue("OK");
});

describe("reconcileStrandedGroups", () => {
  it("resumes a stranded group from the persisted block index", async () => {
    setupScan([strandedEvent()]);

    const resumed = await reconcileStrandedGroups();

    expect(resumed).toBe(1);
    expect(runGroup).toHaveBeenCalledWith("evt-1", "ABC123", "group-2", 3);
  });

  it("resumes from the start of the group when nothing was sent yet", async () => {
    setupScan([strandedEvent({ current_block_index: 0 })]);

    await reconcileStrandedGroups();

    expect(runGroup).toHaveBeenCalledWith("evt-1", "ABC123", "group-2", 0);
  });

  it("leaves a recently active event alone — its run may still be in flight", async () => {
    setupScan([strandedEvent()], new Date());

    const resumed = await reconcileStrandedGroups();

    expect(resumed).toBe(0);
    expect(runGroup).not.toHaveBeenCalled();
  });

  it("skips an event another process has already claimed", async () => {
    setupScan([strandedEvent()]);
    mockedRedis.set.mockResolvedValueOnce(null); // SET NX lost

    const resumed = await reconcileStrandedGroups();

    expect(resumed).toBe(0);
    expect(runGroup).not.toHaveBeenCalled();
  });

  it("takes the resume lock with NX so a second pass cannot double-resume", async () => {
    setupScan([strandedEvent()]);

    await reconcileStrandedGroups();

    expect(mockedRedis.set).toHaveBeenCalledWith(
      "group-resume:evt-1",
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("falls back to started_at when the event has no messages", async () => {
    setupScan([strandedEvent()], null);

    const resumed = await reconcileStrandedGroups();

    expect(resumed).toBe(1);
  });

  it("does nothing when no events are stranded", async () => {
    setupScan([]);

    const resumed = await reconcileStrandedGroups();

    expect(resumed).toBe(0);
    expect(runGroup).not.toHaveBeenCalled();
  });
});
