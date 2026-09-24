import { describe, it, expect } from "vitest";
import { EMPTY_ROUTE_FACTS, routeFactsInputSchema } from "@cityroam/shared/validation";
import type { RouteFacts } from "@cityroam/shared/types";
import {
  buildRouteFactsPayload,
  COVERED_OPTIONS,
  factsToForm,
  isRouteFactsFormDirty,
  mapUrlFromCoordinates,
  previewMapUrl,
  STEP_FREE_OPTIONS,
  TOILETS_OPTIONS,
  type RouteFactsFormState,
} from "../lib/route-facts-form";

// The panel keeps every edit in local form state and only sends the body
// built here when Save is pressed; these tests cover that body and the
// validation messages the panel shows.

const saved: RouteFacts = {
  startPoint: {
    label: { en: "City Square", es: null, fr: "Place de la Ville", de: null, nl: null },
    lat: 53.7963,
    lng: -1.5477,
    mapUrl: "https://maps.google.com/?q=53.7963,-1.5477",
  },
  distanceKm: 2.5,
  durationMins: 60,
  stops: 4,
  stepFree: "mostly",
  dogs: false,
  toilets: "on_route",
  covered: "some",
  updatedAt: "2026-09-24T10:00:00.000Z",
};

const emptyForm = () => factsToForm(EMPTY_ROUTE_FACTS);

describe("route facts form", () => {
  it("round-trips saved facts through the form unchanged", () => {
    const form = factsToForm(saved);
    expect(form.dogs).toBe("no");
    expect(form.label.es).toBe("");
    const built = buildRouteFactsPayload(form);
    expect(built).toEqual({
      ok: true,
      payload: {
        startPoint: saved.startPoint,
        distanceKm: 2.5,
        durationMins: 60,
        stops: 4,
        stepFree: "mostly",
        dogs: false,
        toilets: "on_route",
        covered: "some",
      },
    });
  });

  it("an untouched empty form saves every fact as null (all hidden)", () => {
    const built = buildRouteFactsPayload(emptyForm());
    expect(built.ok && built.payload).toEqual({
      startPoint: null,
      distanceKm: null,
      durationMins: null,
      stops: null,
      stepFree: null,
      dogs: null,
      toilets: null,
      covered: null,
    });
  });

  it("the body it builds is what the API's shared schema accepts", () => {
    const built = buildRouteFactsPayload(factsToForm(saved));
    if (!built.ok) throw new Error("expected ok");
    expect(routeFactsInputSchema.safeParse(built.payload).success).toBe(true);
  });

  it("a half-filled start point names each missing part", () => {
    const form: RouteFactsFormState = { ...emptyForm(), label: { ...emptyForm().label, fr: "Place" } };
    const built = buildRouteFactsPayload(form);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors["label.en"]).toMatch(/English label is required/);
    expect(built.errors.lat).toMatch(/Latitude is required/);
    expect(built.errors.lng).toMatch(/Longitude is required/);
    expect(built.errors.mapUrl).toMatch(/Map URL is required/);
  });

  it("shows the shared schema's messages against the right fields", () => {
    const form: RouteFactsFormState = {
      ...factsToForm(saved),
      lat: "95",
      mapUrl: "https://example.com/?q=1,2",
      durationMins: "45.5",
      stops: "abc",
    };
    const built = buildRouteFactsPayload(form);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors.lat).toMatch(/between -90 and 90/);
    expect(built.errors.mapUrl).toMatch(/maps\.google\.com/);
    expect(built.errors.durationMins).toMatch(/whole number/);
    expect(built.errors.stops).toBe("Stops must be a number");
  });

  it("tracks unsaved changes against the last saved values", () => {
    const base = factsToForm(saved);
    expect(isRouteFactsFormDirty(base, factsToForm(saved))).toBe(false);
    expect(isRouteFactsFormDirty({ ...base, covered: "most" }, base)).toBe(true);
    expect(isRouteFactsFormDirty({ ...base, label: { ...base.label, nl: "x" } }, base)).toBe(true);
  });

  it("links to Google Maps from the typed URL, or else from the coordinates", () => {
    const base = factsToForm(saved);
    expect(previewMapUrl(base)).toBe(saved.startPoint!.mapUrl);
    expect(previewMapUrl({ ...base, mapUrl: "", lat: "53.8", lng: "-1.55" })).toBe("https://maps.google.com/?q=53.8,-1.55");
    expect(previewMapUrl({ ...base, mapUrl: "", lat: "", lng: "" })).toBeNull();
    expect(mapUrlFromCoordinates({ lat: "91", lng: "0" })).toBeNull();
  });

  it("offers every enum value plus a 'not checked' choice for each select", () => {
    const values = (opts: { value: string }[]) => opts.map((o) => o.value);
    expect(values(STEP_FREE_OPTIONS)).toEqual(["", ...routeFactsInputSchema.shape.stepFree.unwrap().options]);
    expect(values(TOILETS_OPTIONS)).toEqual(["", ...routeFactsInputSchema.shape.toilets.unwrap().options]);
    expect(values(COVERED_OPTIONS)).toEqual(["", ...routeFactsInputSchema.shape.covered.unwrap().options]);
  });
});
