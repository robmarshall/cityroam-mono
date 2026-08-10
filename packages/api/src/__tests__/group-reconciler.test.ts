import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

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
import {
  reconcileStrandedGroups,
  startGroupReconciler,
  stopGroupReconciler,
  strandedCandidateFilter,
  isStranded,
  STRANDED_AFTER_MS,
} from "../services/group-reconciler.js";
import { PgDialect } from "drizzle-orm/pg-core";
import { MAX_BLOCK_DELAY_MS } from "@cityroam/shared/constants";

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

// =====================================================================
// The real candidate predicate and staleness rule
// =====================================================================

describe("strandedCandidateFilter", () => {
  it("renders SQL selecting in-progress events with no block but a group", () => {
    const { sql, params } = new PgDialect().sqlToQuery(strandedCandidateFilter()!);

    expect(sql).toContain('"status" = ');
    expect(params).toContain("IN_PROGRESS");
    expect(sql).toContain('"current_block_id" is null');
    expect(sql).toContain('"current_group_id" is not null');
  });

  it("does not match on current_block_index, which is never null", () => {
    const { sql } = new PgDialect().sqlToQuery(strandedCandidateFilter()!);

    expect(sql).not.toContain("current_block_index");
  });
});

describe("isStranded", () => {
  it("leaves a run that could still be waiting out the longest block delay", () => {
    const now = Date.now();
    expect(isStranded(now - MAX_BLOCK_DELAY_MS, now)).toBe(false);
  });

  it("keeps a full extra block delay of margin past the longest delay", () => {
    expect(STRANDED_AFTER_MS).toBeGreaterThanOrEqual(MAX_BLOCK_DELAY_MS * 2);
  });

  it("treats an event quiet past the threshold as stranded", () => {
    const now = Date.now();
    expect(isStranded(now - STRANDED_AFTER_MS - 1, now)).toBe(true);
  });

  it("treats an event with no known activity as stranded", () => {
    expect(isStranded(null)).toBe(true);
  });
});

// =====================================================================
// Interval scanning
// =====================================================================

describe("startGroupReconciler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopGroupReconciler();
    vi.useRealTimers();
  });

  it("re-scans on an interval so a restart mid-delay is still picked up later", async () => {
    // Pass 1 — restarted seconds after the last message, so not stranded yet
    setupScan([strandedEvent()], new Date());

    startGroupReconciler();
    await vi.advanceTimersByTimeAsync(0);
    expect(runGroup).not.toHaveBeenCalled();

    // Pass 2 — the same event, now aged past the threshold
    setupScan(
      [strandedEvent()],
      new Date(Date.now() - STRANDED_AFTER_MS - 1000),
    );
    await vi.advanceTimersByTimeAsync(60_000);

    expect(runGroup).toHaveBeenCalledWith("evt-1", "ABC123", "group-2", 3);
  });

  it("stops scanning after stopGroupReconciler", async () => {
    setupScan([]);

    startGroupReconciler();
    await vi.advanceTimersByTimeAsync(0);
    const passesBefore = mockedDb.select.mock.calls.length;

    stopGroupReconciler();
    await vi.advanceTimersByTimeAsync(300_000);

    expect(mockedDb.select.mock.calls.length).toBe(passesBefore);
  });
});
