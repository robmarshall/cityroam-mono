import { describe, expect, it } from "vitest";
import {
  EMPTY_ROUTE_FACTS,
  googleMapsUrl,
  routeFactsInputSchema,
  routeFactsSchema,
  startPointLabel,
} from "./route-facts.js";

const startPoint = {
  label: { en: "City Square", es: "", fr: "  ", de: null, nl: "City Square" },
  lat: 53.7963,
  lng: -1.5477,
  mapUrl: "https://maps.google.com/?q=53.7963,-1.5477",
};

const full = {
  startPoint,
  distanceKm: 2.5,
  durationMins: 60,
  stops: 4,
  stepFree: "mostly",
  dogs: true,
  toilets: "on_route",
  covered: "some",
};

describe("routeFactsInputSchema", () => {
  it("accepts a complete set and normalises blank translations to null", () => {
    const parsed = routeFactsInputSchema.parse(full);
    expect(parsed.startPoint?.label).toEqual({ en: "City Square", es: null, fr: null, de: null, nl: "City Square" });
    expect(parsed.stepFree).toBe("mostly");
  });

  it("accepts all nulls, the state before the route walk", () => {
    const { updatedAt: _ignored, ...empty } = EMPTY_ROUTE_FACTS;
    expect(routeFactsInputSchema.parse(empty)).toEqual(empty);
  });

  it("requires every key, so a save always replaces the whole set", () => {
    const { dogs: _dropped, ...missing } = full;
    const result = routeFactsInputSchema.safeParse(missing);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["dogs"]);
  });

  it("drops unknown keys such as an echoed updatedAt", () => {
    const parsed = routeFactsInputSchema.parse({ ...full, updatedAt: "2026-09-24T10:00:00.000Z", id: "x" });
    expect(parsed).not.toHaveProperty("updatedAt");
    expect(parsed).not.toHaveProperty("id");
  });

  it("rounds distance to two decimals", () => {
    expect(routeFactsInputSchema.parse({ ...full, distanceKm: 2.456 }).distanceKm).toBe(2.46);
  });

  it.each([
    ["an English label", { ...full, startPoint: { ...startPoint, label: { en: " " } } }],
    ["latitude in range", { ...full, startPoint: { ...startPoint, lat: 91 } }],
    ["longitude in range", { ...full, startPoint: { ...startPoint, lng: -181 } }],
    ["a Google Maps link", { ...full, startPoint: { ...startPoint, mapUrl: "https://example.com/?q=1,2" } }],
    ["https for the map link", { ...full, startPoint: { ...startPoint, mapUrl: "http://maps.google.com/?q=1,2" } }],
    ["a positive distance", { ...full, distanceKm: 0 }],
    ["whole minutes", { ...full, durationMins: 60.5 }],
    ["whole stops", { ...full, stops: 0 }],
    ["a known step-free value", { ...full, stepFree: "partly" }],
    ["a known toilets value", { ...full, toilets: true }],
    ["a known cover value", { ...full, covered: "little" }],
    ["a boolean for dogs", { ...full, dogs: "yes" }],
  ])("requires %s", (_what, input) => {
    expect(routeFactsInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("routeFactsSchema", () => {
  it("adds updatedAt, null until the first save", () => {
    expect(routeFactsSchema.parse(EMPTY_ROUTE_FACTS)).toEqual(EMPTY_ROUTE_FACTS);
    expect(routeFactsSchema.parse({ ...full, updatedAt: "2026-09-24T10:00:00.000Z" }).updatedAt).toBe(
      "2026-09-24T10:00:00.000Z",
    );
    expect(routeFactsSchema.safeParse({ ...full, updatedAt: "yesterday" }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("builds a map link the schema accepts", () => {
    const url = googleMapsUrl(53.7963, -1.5477);
    expect(url).toBe("https://maps.google.com/?q=53.7963,-1.5477");
    expect(routeFactsInputSchema.shape.startPoint.parse({ ...startPoint, mapUrl: url })?.mapUrl).toBe(url);
  });

  it("falls back to the English label when a translation is missing", () => {
    const parsed = routeFactsInputSchema.parse(full).startPoint!;
    expect(startPointLabel(parsed, "nl")).toBe("City Square");
    expect(startPointLabel(parsed, "de")).toBe("City Square");
    expect(startPointLabel({ ...parsed, label: { ...parsed.label, fr: "Place de la Ville" } }, "fr")).toBe("Place de la Ville");
  });
});
