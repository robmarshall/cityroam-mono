/**
 * The two counters two players can race on.
 *
 * These tests pin the shape of the statements rather than their effect: both
 * have to be a single conditional UPDATE that does its arithmetic in SQL and
 * returns the post-increment value, because that is the only version of them
 * that survives two people typing at once.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema/index.js")>(
    "../../db/schema/index.js",
  );
  const calls: any = { set: null, where: null, returning: null };
  const mockDb: any = {
    calls,
    rows: [] as unknown[],
    update: vi.fn(() => mockDb),
    set: vi.fn((v: unknown) => {
      calls.set = v;
      return mockDb;
    }),
    where: vi.fn((v: unknown) => {
      calls.where = v;
      return mockDb;
    }),
    returning: vi.fn((v: unknown) => {
      calls.returning = v;
      return Promise.resolve(mockDb.rows);
    }),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

import { db } from "../../db/index.js";
import { claimHint, recordWrongAttempt } from "../../services/pipeline/event-counters.js";

const mockDb = db as any;

function renderWhere(): string {
  return new PgDialect().sqlToQuery(mockDb.calls.where).sql;
}

function renderSet(column: string): string {
  return new PgDialect().sqlToQuery(mockDb.calls.set[column]).sql;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.rows = [];
  mockDb.calls.set = null;
  mockDb.calls.where = null;
  mockDb.calls.returning = null;
});

describe("claimHint", () => {
  it("increments in SQL rather than writing a value read earlier", async () => {
    mockDb.rows = [{ hints_given: 1 }];

    await claimHint("evt-1", "block-1", 3);

    expect(renderSet("hints_given")).toContain('"hints_given" + 1');
  });

  it("only moves the counter while the event is still on that block", async () => {
    mockDb.rows = [{ hints_given: 1 }];

    await claimHint("evt-1", "block-1", 3);

    const where = renderWhere();
    expect(where).toContain('"id" = ');
    expect(where).toContain('"current_block_id" = ');
  });

  it("stops one past the last hint, so exactly one caller gets the reveal", async () => {
    mockDb.rows = [{ hints_given: 4 }];

    await claimHint("evt-1", "block-1", 3);

    // hints_given <= maxHints, so the winning value can reach maxHints + 1
    expect(renderWhere()).toContain('"hints_given" <= ');
  });

  it("returns the post-increment value the row lock produced", async () => {
    mockDb.rows = [{ hints_given: 2 }];

    await expect(claimHint("evt-1", "block-1", 3)).resolves.toBe(2);
  });

  it("returns null when the update matches no row", async () => {
    mockDb.rows = [];

    await expect(claimHint("evt-1", "block-1", 3)).resolves.toBeNull();
  });
});

describe("recordWrongAttempt", () => {
  it("increments in SQL and reads hints_given in the same statement", async () => {
    mockDb.rows = [{ wrong_attempts: 3, hints_given: 0 }];

    const result = await recordWrongAttempt("evt-1", "block-1");

    expect(renderSet("wrong_attempts")).toContain('"wrong_attempts" + 1');
    expect(Object.keys(mockDb.calls.returning)).toEqual([
      "wrong_attempts",
      "hints_given",
    ]);
    expect(result).toEqual({ wrongAttempts: 3, hintsGiven: 0 });
  });

  it("is scoped to the block the answer was aimed at", async () => {
    mockDb.rows = [{ wrong_attempts: 1, hints_given: 0 }];

    await recordWrongAttempt("evt-1", "block-1");

    const where = renderWhere();
    expect(where).toContain('"id" = ');
    expect(where).toContain('"current_block_id" = ');
  });

  it("returns null when the group has already left the block", async () => {
    mockDb.rows = [];

    await expect(recordWrongAttempt("evt-1", "block-1")).resolves.toBeNull();
  });
});
