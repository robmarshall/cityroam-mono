import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Unmock event-expiry so we test the real implementation
vi.unmock("../services/event-expiry.js");

// Mock db
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([]),
    query: { events: { findFirst: vi.fn() } },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    returning: vi.fn(() => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

import { db } from "../db/index.js";
import {
  sweepExpiredEvents,
  startExpirySweep,
  stopExpirySweep,
} from "../services/event-expiry.js";

// ── sweepExpiredEvents ────────────────────────────────────────────
describe("sweepExpiredEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the default chain — each chained method returns the mockDb
    const mockDb = db as any;
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.returning.mockResolvedValue([]);
  });

  it("returns count of expired events", async () => {
    const mockDb = db as any;
    mockDb.returning.mockResolvedValue([{ id: "evt_1" }, { id: "evt_2" }]);

    const count = await sweepExpiredEvents();

    expect(count).toBe(2);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith({ status: "EXPIRED" });
  });

  it("returns 0 when no events are expired", async () => {
    const mockDb = db as any;
    mockDb.returning.mockResolvedValue([]);

    const count = await sweepExpiredEvents();

    expect(count).toBe(0);
  });

  it("logs a message when events are expired", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockDb = db as any;
    mockDb.returning.mockResolvedValue([{ id: "evt_1" }]);

    await sweepExpiredEvents();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"component":"expiry-sweep"'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"count":1'),
    );
    consoleSpy.mockRestore();
  });

  it("does not log when no events are expired", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockDb = db as any;
    mockDb.returning.mockResolvedValue([]);

    await sweepExpiredEvents();

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('"component":"expiry-sweep"'),
    );
    consoleSpy.mockRestore();
  });
});

// ── startExpirySweep / stopExpirySweep ────────────────────────────
describe("startExpirySweep / stopExpirySweep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Ensure a clean timer state — stop any leftover sweep
    stopExpirySweep();

    const mockDb = db as any;
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.returning.mockResolvedValue([]);

    // Suppress console output during timer tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stopExpirySweep();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs an initial sweep on startup", async () => {
    const mockDb = db as any;

    startExpirySweep();

    // The initial sweep is called immediately (as a promise)
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("runs sweep again after 6 hours", async () => {
    const mockDb = db as any;

    startExpirySweep();
    // Initial call
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    // Advance past the 6-hour interval
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    vi.advanceTimersByTime(SIX_HOURS_MS);

    // The interval callback fires, triggering another sweep
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — calling startExpirySweep twice does not create two timers", async () => {
    const mockDb = db as any;

    startExpirySweep();
    startExpirySweep(); // second call should be a no-op

    // Only one initial sweep should have fired
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    vi.advanceTimersByTime(SIX_HOURS_MS);

    // Only one interval tick, not two
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it("stopExpirySweep prevents further interval sweeps", async () => {
    const mockDb = db as any;

    startExpirySweep();
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    stopExpirySweep();

    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    vi.advanceTimersByTime(SIX_HOURS_MS);

    // No additional sweep after stop
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("stopExpirySweep is safe to call when no sweep is running", () => {
    // Should not throw
    expect(() => stopExpirySweep()).not.toThrow();
  });
});
