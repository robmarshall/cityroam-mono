import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// drizzle-orm's pg migrator applies a journal entry only when its `when` is
// greater than the newest `created_at` already in drizzle.__drizzle_migrations.
// An entry whose `when` is older than one before it is silently skipped on any
// database that has already run the earlier migration, so the journal has to
// be strictly increasing in file order.

const drizzleDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const journal = JSON.parse(readFileSync(resolve(drizzleDir, "meta/_journal.json"), "utf8")) as {
  entries: JournalEntry[];
};

describe("drizzle migration journal", () => {
  it("has entries", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("numbers idx 0..n-1 in file order", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx, entry.tag).toBe(i);
    });
  });

  it("uses a tag prefix that matches idx and a SQL file that exists", () => {
    for (const entry of journal.entries) {
      expect(entry.tag.slice(0, 4), entry.tag).toBe(String(entry.idx).padStart(4, "0"));
      expect(existsSync(resolve(drizzleDir, `${entry.tag}.sql`)), entry.tag).toBe(true);
    }
  });

  it("has strictly increasing `when` timestamps", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const curr = journal.entries[i];
      expect(
        curr.when,
        `${curr.tag} (when=${curr.when}) must be later than ${prev.tag} (when=${prev.when})`,
      ).toBeGreaterThan(prev.when);
    }
  });
});
