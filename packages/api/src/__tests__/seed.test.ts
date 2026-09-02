import { describe, it, expect, vi } from "vitest";

// `postgres` is only reachable through the seed module's `main()`, which is
// guarded behind a direct-invocation check. Mocked anyway so an accidental
// import can never open a socket in CI.
vi.mock("postgres", () => ({ default: vi.fn(() => ({ end: vi.fn() })) }));

import { messageBankSeedData, seedMessageBanks } from "../db/seed.js";
import { routesByLanguage } from "../db/seed-routes.js";

type SeedEntry = { type: string; content: string };

/** Minimal stand-in for the drizzle handle the seeder takes. */
function fakeDb(existing: SeedEntry[]) {
  const inserted: SeedEntry[] = [];
  const db: any = {
    select: () => db,
    from: () => db,
    where: async () => existing,
    insert: () => db,
    values: async (rows: SeedEntry[]) => {
      inserted.push(...rows);
    },
  };
  return { db, inserted };
}

describe("seedMessageBanks", () => {
  it("inserts every entry into an empty database", async () => {
    const { db, inserted } = fakeDb([]);

    await seedMessageBanks(db);

    expect(inserted).toHaveLength(messageBankSeedData.length);
    expect(inserted.every((row: any) => row.language === "en")).toBe(true);
  });

  it("inserts nothing on a second run", async () => {
    const alreadyThere = messageBankSeedData.map((e) => ({
      type: e.type,
      content: e.content,
    }));
    const { db, inserted } = fakeDb(alreadyThere);

    await seedMessageBanks(db);

    // Re-running used to duplicate the whole bank, which skewed the random
    // pick towards whichever line had been inserted most often.
    expect(inserted).toHaveLength(0);
  });

  it("adds only the entries a newer version introduced", async () => {
    const alreadyThere = messageBankSeedData
      .slice(0, 5)
      .map((e) => ({ type: e.type, content: e.content }));
    const { db, inserted } = fakeDb(alreadyThere);

    await seedMessageBanks(db);

    expect(inserted).toHaveLength(messageBankSeedData.length - 5);
    // An admin's own edits are never touched.
    expect(inserted.map((r) => r.content)).not.toContain(alreadyThere[0].content);
  });

  it("treats two entries of the same type as distinct rows", async () => {
    const first = messageBankSeedData.find((e) => e.type === "success")!;
    const { db, inserted } = fakeDb([{ type: first.type, content: first.content }]);

    await seedMessageBanks(db);

    const successRows = inserted.filter((r) => r.type === "success");
    const allSuccess = messageBankSeedData.filter((e) => e.type === "success");
    expect(successRows).toHaveLength(allSuccess.length - 1);
  });
});

describe("the seeded development route", () => {
  it("carries content, so `npm run seed` cannot leave an unplayable active route", async () => {
    const dev = routesByLanguage.en;

    expect(dev).toBeDefined();
    expect(dev.is_active).toBe(true);
    // An active route with no groups is worse than no route: checkout can pick
    // it, the buyer pays, and the hunt dies on start with "Route has no groups".
    expect(dev.groups.length).toBeGreaterThan(0);
    expect(dev.groups.every((g) => g.blocks.length > 0)).toBe(true);
  });
});
