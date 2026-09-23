import { describe, it, expect, vi } from "vitest";
import { lintRoute } from "../index.js";

// The Leeds dev routes live in packages/api/src/db/seed-routes.ts. Importing it
// has no side effects (main() only runs when the file is executed directly, and
// the postgres client is created inside main()); postgres is mocked anyway, as
// packages/api/src/__tests__/seed.test.ts does, so no socket can ever open.
// The path is computed so tsc does not pull the api package into this
// package's typecheck.
vi.mock("postgres", () => ({ default: vi.fn(() => ({ end: vi.fn() })) }));

type SeedRoute = {
  name: string;
  description: string;
  estimated_duration_mins: number;
  estimated_distance_km: string;
  is_active: boolean;
  groups: { name: string; blocks: unknown[] }[];
};

const seedModulePath = new URL("../../../../api/src/db/seed-routes.ts", import.meta.url).href;
const { routesByLanguage, DEV_ROUTE_FAMILY } = (await import(/* @vite-ignore */ seedModulePath)) as {
  routesByLanguage: Record<string, SeedRoute>;
  DEV_ROUTE_FAMILY: { city: string };
};

/** Seed data → bulk-create payload (the seed stores distance as a decimal string). */
function toPayload(language: string, r: SeedRoute) {
  return {
    route: {
      name: r.name,
      description: r.description,
      language,
      city: DEV_ROUTE_FAMILY.city,
      estimated_duration_mins: r.estimated_duration_mins,
      estimated_distance_km: Number(r.estimated_distance_km),
      is_active: r.is_active,
    },
    groups: r.groups,
  };
}

describe("Leeds seed routes", () => {
  it("covers every seeded language", () => {
    expect(Object.keys(routesByLanguage).sort()).toEqual(["de", "en", "es", "fr", "nl"]);
  });

  it.each(Object.entries(routesByLanguage))("%s lints with zero errors", (language, route) => {
    const result = lintRoute(toPayload(language, route));
    expect(result.errors).toEqual([]);
  });

  it.each(Object.entries(routesByLanguage))(
    "%s only warns that it is active with placeholder images",
    (language, route) => {
      const result = lintRoute(toPayload(language, route));
      expect(result.warnings.filter((w) => w.rule !== "active-with-placeholders")).toEqual([]);
      expect(result.warnings.map((w) => w.rule)).toContain("active-with-placeholders");
    },
  );
});
