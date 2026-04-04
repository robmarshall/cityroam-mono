import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock env ────────────────────────────────────────────────────────
vi.mock("../env.js", () => ({
  env: { REVIEW_LINK: "https://review.test.com" },
}));

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema/index.js")>(
    "../db/schema/index.js",
  );
  const mockDb: any = {
    query: {
      routes: { findFirst: vi.fn() },
      routeFamilies: { findFirst: vi.fn() },
    },
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

// ── Imports (after mocks) ───────────────────────────────────────────
import { applyTemplateVars, buildRouteTemplateVars } from "../services/template-vars.js";
import { db } from "../db/index.js";

const mockedDb = db as any;

// =====================================================================
// applyTemplateVars (pure function — no mocks needed)
// =====================================================================
describe("applyTemplateVars", () => {
  it("replaces a single placeholder", () => {
    const result = applyTemplateVars("Hello {{NAME}}", { NAME: "Alice" });
    expect(result).toBe("Hello Alice");
  });

  it("replaces multiple different placeholders", () => {
    const result = applyTemplateVars(
      "Welcome to {{CITY_NAME}}! There are {{TOTAL_STOPS}} stops.",
      { CITY_NAME: "Amsterdam", TOTAL_STOPS: "5" },
    );
    expect(result).toBe("Welcome to Amsterdam! There are 5 stops.");
  });

  it("replaces repeated occurrences of the same placeholder", () => {
    const result = applyTemplateVars(
      "{{CITY}} is great. Visit {{CITY}} again!",
      { CITY: "Paris" },
    );
    expect(result).toBe("Paris is great. Visit Paris again!");
  });

  it("leaves string unchanged when no placeholders match", () => {
    const result = applyTemplateVars(
      "No placeholders here",
      { CITY_NAME: "London" },
    );
    expect(result).toBe("No placeholders here");
  });

  it("leaves unmatched placeholders intact", () => {
    const result = applyTemplateVars(
      "Hello {{NAME}}, welcome to {{CITY}}",
      { NAME: "Bob" },
    );
    expect(result).toBe("Hello Bob, welcome to {{CITY}}");
  });

  it("returns content unchanged when vars is empty", () => {
    const result = applyTemplateVars("Hello {{NAME}}", {});
    expect(result).toBe("Hello {{NAME}}");
  });

  it("handles empty content string", () => {
    const result = applyTemplateVars("", { NAME: "Alice" });
    expect(result).toBe("");
  });
});

// =====================================================================
// buildRouteTemplateVars (needs db mocks)
// =====================================================================
describe("buildRouteTemplateVars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns vars with CITY_NAME, TOTAL_STOPS, DISTANCE_KM, REVIEW_LINK when route and family exist", async () => {
    mockedDb.query.routes.findFirst.mockResolvedValueOnce({
      route_family_id: "family-1",
      total_stops: 5,
      estimated_distance_km: "3.2",
    });
    mockedDb.query.routeFamilies.findFirst.mockResolvedValueOnce({
      city: "Amsterdam",
    });

    const vars = await buildRouteTemplateVars("route-1");

    expect(vars).toEqual({
      CITY_NAME: "Amsterdam",
      TOTAL_STOPS: "5",
      DISTANCE_KM: "3.2",
      REVIEW_LINK: "https://review.test.com",
    });
  });

  it("returns empty object when route is not found", async () => {
    mockedDb.query.routes.findFirst.mockResolvedValueOnce(undefined);

    const vars = await buildRouteTemplateVars("nonexistent-route");

    expect(vars).toEqual({});
    // Should not attempt to look up family
    expect(mockedDb.query.routeFamilies.findFirst).not.toHaveBeenCalled();
  });

  it("returns empty CITY_NAME when family is not found", async () => {
    mockedDb.query.routes.findFirst.mockResolvedValueOnce({
      route_family_id: "missing-family",
      total_stops: 3,
      estimated_distance_km: "1.5",
    });
    mockedDb.query.routeFamilies.findFirst.mockResolvedValueOnce(undefined);

    const vars = await buildRouteTemplateVars("route-2");

    expect(vars).toEqual({
      CITY_NAME: "",
      TOTAL_STOPS: "3",
      DISTANCE_KM: "1.5",
      REVIEW_LINK: "https://review.test.com",
    });
  });
});
