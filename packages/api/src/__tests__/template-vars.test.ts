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
import { guideNameFor } from "@cityroam/shared/constants";
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

  it("returns vars with CITY_NAME, TOTAL_STOPS, DISTANCE_KM, REVIEW_LINK, GUIDE_NAME when route and family exist", async () => {
    mockedDb.query.routes.findFirst.mockResolvedValueOnce({
      route_family_id: "family-1",
      total_stops: 5,
      estimated_distance_km: "3.2",
      language: "en",
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
      GUIDE_NAME: "the Owl",
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
      language: "en",
    });
    mockedDb.query.routeFamilies.findFirst.mockResolvedValueOnce(undefined);

    const vars = await buildRouteTemplateVars("route-2");

    expect(vars).toEqual({
      CITY_NAME: "",
      TOTAL_STOPS: "3",
      DISTANCE_KM: "1.5",
      REVIEW_LINK: "https://review.test.com",
      GUIDE_NAME: "the Owl",
    });
  });

  it.each([
    ["en", "the Owl"],
    ["es", "el Búho"],
    ["fr", "le Hibou"],
    ["de", "die Eule"],
    ["nl", "de Uil"],
  ])("resolves GUIDE_NAME for an event in %s", async (language, name) => {
    mockedDb.query.routes.findFirst.mockResolvedValueOnce({
      route_family_id: "family-1",
      total_stops: 5,
      estimated_distance_km: "3.2",
      language: "en",
    });
    mockedDb.query.routeFamilies.findFirst.mockResolvedValueOnce({ city: "Leeds" });

    const vars = await buildRouteTemplateVars("route-1", language);

    expect(vars.GUIDE_NAME).toBe(name);
  });

  it("falls back to the route's language when no event language is given", async () => {
    mockedDb.query.routes.findFirst.mockResolvedValueOnce({
      route_family_id: "family-1",
      total_stops: 5,
      estimated_distance_km: "3.2",
      language: "de",
    });
    mockedDb.query.routeFamilies.findFirst.mockResolvedValueOnce({ city: "Leeds" });

    const vars = await buildRouteTemplateVars("route-1");

    expect(vars.GUIDE_NAME).toBe("die Eule");
  });

  it("substitutes GUIDE_NAME into an intro block", () => {
    expect(applyTemplateVars("I'm {{GUIDE_NAME}}.", { GUIDE_NAME: "the Owl" })).toBe("I'm the Owl.");
  });
});

// =====================================================================
// GUIDE_NAME: lower case in running text, capitalised at a sentence start
// =====================================================================
describe("applyTemplateVars with GUIDE_NAME", () => {
  it.each([
    ["en", "I'm {{GUIDE_NAME}}. I know these streets.", "I'm the Owl. I know these streets."],
    ["es", "Soy {{GUIDE_NAME}}. Conozco estas calles.", "Soy el Búho. Conozco estas calles."],
    ["fr", "Je suis {{GUIDE_NAME}}. Je connais ces rues.", "Je suis le Hibou. Je connais ces rues."],
    ["de", "Ich bin {{GUIDE_NAME}}. Ich kenne diese Straßen.", "Ich bin die Eule. Ich kenne diese Straßen."],
    ["nl", "Ik ben {{GUIDE_NAME}}. Ik ken deze straten.", "Ik ben de Uil. Ik ken deze straten."],
  ] as const)("keeps the article lower case mid-sentence (%s)", (language, content, expected) => {
    const vars = { GUIDE_NAME: guideNameFor(language).inSentence };
    expect(applyTemplateVars(content, vars)).toBe(expected);
  });

  it.each([
    ["en", "{{GUIDE_NAME}} knows the way.", "The Owl knows the way."],
    ["es", "Welcome. {{GUIDE_NAME}} conoce el camino.", "Welcome. El Búho conoce el camino."],
    ["fr", "Bienvenue ! {{GUIDE_NAME}} connaît le chemin.", "Bienvenue ! Le Hibou connaît le chemin."],
    ["de", "Bereit? {{GUIDE_NAME}} kennt den Weg.", "Bereit? Die Eule kennt den Weg."],
    ["nl", "Welkom.\n{{GUIDE_NAME}} kent de weg.", "Welkom.\nDe Uil kent de weg."],
  ] as const)("capitalises the article at the start of a sentence (%s)", (language, content, expected) => {
    const vars = { GUIDE_NAME: guideNameFor(language).inSentence };
    expect(applyTemplateVars(content, vars)).toBe(expected);
  });

  it.each([
    ['"{{GUIDE_NAME}} here," it said.', '"The Owl here," it said.'],
    ["Done. (“{{GUIDE_NAME}}”)", "Done. (“The Owl”)"],
    ["Right…  {{GUIDE_NAME}} again.", "Right…  The Owl again."],
    ["  {{GUIDE_NAME}} again.", "  The Owl again."],
    ["Ask {{GUIDE_NAME}}, then {{GUIDE_NAME}} answers.", "Ask the Owl, then the Owl answers."],
    ["Stop 3: {{GUIDE_NAME}} waits.", "Stop 3: the Owl waits."],
    ["{{CITY_NAME}}. {{GUIDE_NAME}} again.", "Leeds. The Owl again."],
  ])("handles %j", (content, expected) => {
    expect(applyTemplateVars(content, { GUIDE_NAME: "the Owl", CITY_NAME: "Leeds" })).toBe(expected);
  });

  it("only sentence-cases GUIDE_NAME, never other variables such as a link", () => {
    expect(
      applyTemplateVars("Leave a review. {{REVIEW_LINK}}", { REVIEW_LINK: "https://g.page/x" }),
    ).toBe("Leave a review. https://g.page/x");
  });

  it("does not expand a placeholder inside a substituted value", () => {
    expect(applyTemplateVars("{{A}} {{B}}", { A: "{{B}}", B: "b" })).toBe("{{B}} b");
  });
});
