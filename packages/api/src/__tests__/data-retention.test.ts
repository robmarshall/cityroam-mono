import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", () => {
  const mockTx: any = {
    delete: vi.fn(() => mockTx),
    update: vi.fn(() => mockTx),
    set: vi.fn(() => mockTx),
    where: vi.fn(() => mockTx),
    returning: vi.fn().mockResolvedValue([]),
  };
  const mockDb: any = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    returning: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(mockTx)),
    __tx: mockTx,
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

// ── Mock redis client ───────────────────────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { messages, participants, events, adminAuditLog } from "../db/schema/index.js";
import {
  anonymiseCandidateFilter,
  paymentRefCandidateFilter,
  anonymiseExpiredEventBatch,
  stripPaymentRefBatch,
  runRetentionSweep,
  runLockedRetentionSweep,
  startRetentionSweep,
  stopRetentionSweep,
  eventRetentionCutoff,
  accountingRetentionCutoff,
  monthsBefore,
  adminAuditRetentionCutoff,
  pruneAdminAuditLogBatch,
  ADMIN_AUDIT_RETENTION_DAYS,
  RETENTION_BATCH_SIZE,
  MAX_BATCHES_PER_RUN,
} from "../services/data-retention.js";

const mockedDb = db as any;
const mockedTx = mockedDb.__tx;
const mockedRedis = redis as any;

function ids(n: number, prefix = "evt") {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));
}

function resetChains() {
  vi.clearAllMocks();
  for (const m of ["select", "from", "where", "orderBy", "update", "set", "delete"]) {
    mockedDb[m].mockReturnValue(mockedDb);
  }
  mockedDb.limit.mockResolvedValue([]);
  mockedDb.returning.mockResolvedValue([]);
  mockedDb.transaction.mockImplementation(async (cb: any) => cb(mockedTx));
  for (const m of ["delete", "update", "set", "where"]) {
    mockedTx[m].mockReturnValue(mockedTx);
  }
  mockedTx.returning.mockResolvedValue([]);
  mockedRedis.set.mockResolvedValue("OK");
  mockedRedis.del.mockResolvedValue(1);
}

// ── cutoffs ───────────────────────────────────────────────────────
describe("retention cutoffs", () => {
  const now = new Date("2026-09-23T12:00:00Z");

  it("event records are kept for 12 months", () => {
    expect(eventRetentionCutoff(now).toISOString()).toBe("2025-09-23T12:00:00.000Z");
  });

  it("purchase records are kept for 6 years", () => {
    expect(accountingRetentionCutoff(now).toISOString()).toBe("2020-09-23T12:00:00.000Z");
  });

  it("monthsBefore works in calendar months", () => {
    expect(monthsBefore(new Date("2026-03-15T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-15T00:00:00.000Z",
    );
  });
});

// ── filters ───────────────────────────────────────────────────────
describe("anonymiseCandidateFilter", () => {
  const { sql, params } = new PgDialect().sqlToQuery(
    anonymiseCandidateFilter(new Date("2025-09-23T00:00:00Z"))!,
  );

  it("only touches events that have ended", () => {
    expect(params).toEqual(expect.arrayContaining(["COMPLETED", "EXPIRED", "REFUNDED"]));
    expect(params).not.toContain("IN_PROGRESS");
    expect(params).not.toContain("NOT_STARTED");
  });

  it("anchors completed hunts on completed_at and expired hunts on expires_at", () => {
    expect(sql).toContain("WHEN 'COMPLETED' THEN COALESCE(\"events\".\"completed_at\"");
    expect(sql).toContain("WHEN 'EXPIRED' THEN \"events\".\"expires_at\"");
    expect(params).toContain("2025-09-23T00:00:00.000Z");
  });

  it("only matches events that still hold personal data (idempotent)", () => {
    expect(sql).toContain('"buyer_email" is not null');
    expect(sql).toContain('"refund_note" is not null');
    expect(sql).toContain('"lead_participant_id" is not null');
    expect(sql).toContain('FROM "participants"');
    expect(sql).toContain('FROM "messages"');
  });
});

describe("paymentRefCandidateFilter", () => {
  it("keys on purchase date and remaining Stripe references", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      paymentRefCandidateFilter(new Date("2020-09-23T00:00:00Z"))!,
    );
    expect(sql).toContain('"created_at" < ');
    expect(sql).toContain('"stripe_session_id" is not null');
    expect(sql).toContain('"stripe_payment_id" is not null');
    expect(params).toHaveLength(1);
  });
});

// ── anonymiseExpiredEventBatch ────────────────────────────────────
describe("anonymiseExpiredEventBatch", () => {
  beforeEach(resetChains);

  it("does nothing when no events are due", async () => {
    const result = await anonymiseExpiredEventBatch();
    expect(result).toEqual({ events: 0, messages: 0, participants: 0 });
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("bounds each batch", async () => {
    await anonymiseExpiredEventBatch();
    expect(mockedDb.limit).toHaveBeenCalledWith(RETENTION_BATCH_SIZE);
  });

  it("deletes messages before participants, then nulls event PII", async () => {
    mockedDb.limit.mockResolvedValueOnce(ids(2));
    mockedTx.returning
      .mockResolvedValueOnce(ids(5, "msg"))
      .mockResolvedValueOnce(ids(3, "p"))
      .mockResolvedValueOnce(ids(2));

    const result = await anonymiseExpiredEventBatch();

    expect(result).toEqual({ events: 2, messages: 5, participants: 3 });
    expect(mockedTx.delete).toHaveBeenNthCalledWith(1, messages);
    expect(mockedTx.delete).toHaveBeenNthCalledWith(2, participants);
    expect(mockedTx.update).toHaveBeenCalledWith(events);
    expect(mockedTx.set).toHaveBeenCalledWith({
      buyer_email: null,
      refund_note: null,
      code_email_error: null,
      lead_participant_id: null,
    });
  });

  it("keeps the event row and its Stripe references", async () => {
    mockedDb.limit.mockResolvedValueOnce(ids(1));
    mockedTx.returning.mockResolvedValue(ids(1));

    await anonymiseExpiredEventBatch();

    expect(mockedTx.delete).not.toHaveBeenCalledWith(events);
    const setArg = mockedTx.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("stripe_session_id");
    expect(setArg).not.toHaveProperty("stripe_payment_id");
  });
});

// ── stripPaymentRefBatch ──────────────────────────────────────────
describe("stripPaymentRefBatch", () => {
  beforeEach(resetChains);

  it("does nothing when no events are past the accounting window", async () => {
    expect(await stripPaymentRefBatch()).toBe(0);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it("nulls Stripe references on old events", async () => {
    mockedDb.limit.mockResolvedValueOnce(ids(3));
    mockedDb.returning.mockResolvedValueOnce(ids(3));

    expect(await stripPaymentRefBatch()).toBe(3);
    expect(mockedDb.set).toHaveBeenCalledWith({
      stripe_session_id: null,
      stripe_payment_id: null,
    });
  });
});

// ── pruneAdminAuditLogBatch ───────────────────────────────────────
describe("pruneAdminAuditLogBatch", () => {
  beforeEach(resetChains);
  const now = new Date("2026-09-23T12:00:00Z");

  it("keeps admin audit rows for 180 days", () => {
    expect(ADMIN_AUDIT_RETENTION_DAYS).toBe(180);
    expect(adminAuditRetentionCutoff(now).toISOString()).toBe("2026-03-27T12:00:00.000Z");
  });

  it("does nothing when no rows are past the window", async () => {
    expect(await pruneAdminAuditLogBatch(now)).toBe(0);
    expect(mockedDb.from).toHaveBeenCalledWith(adminAuditLog);
    expect(mockedDb.delete).not.toHaveBeenCalled();
  });

  it("selects only rows older than the cutoff", async () => {
    await pruneAdminAuditLogBatch(now);
    const where = mockedDb.where.mock.calls[0][0];
    const { sql, params } = new PgDialect().sqlToQuery(where);
    expect(sql).toContain('"admin_audit_log"."created_at" < ');
    expect(params).toContain("2026-03-27T12:00:00.000Z");
    expect(mockedDb.limit).toHaveBeenCalledWith(RETENTION_BATCH_SIZE);
  });

  it("deletes the batch of expired rows", async () => {
    mockedDb.limit.mockResolvedValueOnce(ids(3, "audit"));
    mockedDb.returning.mockResolvedValueOnce(ids(3, "audit"));

    expect(await pruneAdminAuditLogBatch(now)).toBe(3);
    expect(mockedDb.delete).toHaveBeenCalledWith(adminAuditLog);
  });

  it("runs as part of the retention sweep", async () => {
    // Anonymise: nothing. Strip: nothing. Audit: one short batch.
    mockedDb.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(ids(2, "audit"));
    mockedDb.returning.mockResolvedValueOnce(ids(2, "audit"));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runRetentionSweep(now);
    expect(result.prunedAuditRows).toBe(2);
    expect(mockedDb.delete).toHaveBeenCalledWith(adminAuditLog);
    vi.restoreAllMocks();
  });
});

// ── runRetentionSweep ─────────────────────────────────────────────
describe("runRetentionSweep", () => {
  beforeEach(() => {
    resetChains();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("is a quiet no-op when nothing is due", async () => {
    const result = await runRetentionSweep();
    expect(result).toEqual({
      anonymisedEvents: 0,
      deletedMessages: 0,
      deletedParticipants: 0,
      strippedPaymentRefs: 0,
      prunedAuditRows: 0,
    });
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('"component":"data-retention"'),
    );
  });

  it("keeps batching while batches come back full", async () => {
    // Anonymise: one full batch, then a short one. Strip: nothing.
    mockedDb.limit
      .mockResolvedValueOnce(ids(RETENTION_BATCH_SIZE))
      .mockResolvedValueOnce(ids(4))
      .mockResolvedValueOnce([]);
    mockedTx.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(ids(RETENTION_BATCH_SIZE))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(ids(4));

    const result = await runRetentionSweep();

    expect(result.anonymisedEvents).toBe(RETENTION_BATCH_SIZE + 4);
    expect(mockedDb.transaction).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"component":"data-retention"'),
    );
  });

  it("stops at the per-run batch cap", async () => {
    mockedDb.limit.mockResolvedValue(ids(RETENTION_BATCH_SIZE));
    mockedTx.returning.mockResolvedValue(ids(RETENTION_BATCH_SIZE));
    mockedDb.returning.mockResolvedValue(ids(RETENTION_BATCH_SIZE));

    await runRetentionSweep();

    expect(mockedDb.transaction).toHaveBeenCalledTimes(MAX_BATCHES_PER_RUN);
    expect(mockedDb.update).toHaveBeenCalledTimes(MAX_BATCHES_PER_RUN);
  });
});

// ── runLockedRetentionSweep ───────────────────────────────────────
describe("runLockedRetentionSweep", () => {
  beforeEach(resetChains);

  it("skips when another process holds the lock", async () => {
    mockedRedis.set.mockResolvedValueOnce(null);
    expect(await runLockedRetentionSweep()).toBeNull();
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it("claims the lock with NX + expiry and releases it afterwards", async () => {
    await runLockedRetentionSweep();
    expect(mockedRedis.set).toHaveBeenCalledWith(
      "data-retention:lock",
      expect.any(String),
      "EX",
      expect.any(Number),
      "NX",
    );
    expect(mockedRedis.del).toHaveBeenCalledWith("data-retention:lock");
  });

  it("releases the lock even when the sweep fails", async () => {
    mockedDb.limit.mockRejectedValueOnce(new Error("db down"));
    await expect(runLockedRetentionSweep()).rejects.toThrow("db down");
    expect(mockedRedis.del).toHaveBeenCalledWith("data-retention:lock");
  });
});

// ── start / stop ──────────────────────────────────────────────────
describe("startRetentionSweep / stopRetentionSweep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetChains();
    stopRetentionSweep();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stopRetentionSweep();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs once on startup and again every 24 hours", async () => {
    startRetentionSweep();
    expect(mockedRedis.set).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(mockedRedis.set).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a second start does not add a timer", async () => {
    startRetentionSweep();
    startRetentionSweep();
    expect(mockedRedis.set).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(mockedRedis.set).toHaveBeenCalledTimes(2);
  });

  it("stop prevents further sweeps", async () => {
    startRetentionSweep();
    stopRetentionSweep();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(mockedRedis.set).toHaveBeenCalledTimes(1);
  });

  it("logs rather than throws when a sweep fails", async () => {
    mockedRedis.set.mockRejectedValueOnce(new Error("redis down"));
    startRetentionSweep();
    await vi.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("retention sweep failed"));
  });
});
