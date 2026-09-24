import type { RouteFacts, RouteFactsInput, SupportedLanguage } from "@cityroam/shared/types";
import {
  GOOGLE_MAPS_URL_PATTERN,
  ROUTE_FACTS_COVERED,
  ROUTE_FACTS_STEP_FREE,
  ROUTE_FACTS_TOILETS,
  googleMapsUrl,
  routeFactsInputSchema,
} from "@cityroam/shared/validation";

/**
 * Form state for the "Route facts" panel on the route family page. Every
 * field is a string so inputs stay controlled and a half-typed number is
 * not lost. Edits change this state only: nothing is sent until Save.
 */
export interface RouteFactsFormState {
  label: Record<SupportedLanguage, string>;
  lat: string;
  lng: string;
  mapUrl: string;
  distanceKm: string;
  durationMins: string;
  stops: string;
  /** "" = not checked yet (hidden on the site). */
  stepFree: "" | (typeof ROUTE_FACTS_STEP_FREE)[number];
  dogs: "" | "yes" | "no";
  toilets: "" | (typeof ROUTE_FACTS_TOILETS)[number];
  covered: "" | (typeof ROUTE_FACTS_COVERED)[number];
}

export type RouteFactsFormField = Exclude<keyof RouteFactsFormState, "label"> | `label.${SupportedLanguage}` | "startPoint";

export type RouteFactsFormErrors = Partial<Record<RouteFactsFormField, string>>;

export const STEP_FREE_OPTIONS: { value: RouteFactsFormState["stepFree"]; label: string }[] = [
  { value: "", label: "Not checked (hidden)" },
  { value: "yes", label: "Yes, all the way" },
  { value: "mostly", label: "Mostly (short detour or a hand)" },
  { value: "no", label: "No, there are steps" },
];

export const DOGS_OPTIONS: { value: RouteFactsFormState["dogs"]; label: string }[] = [
  { value: "", label: "Not checked (hidden)" },
  { value: "yes", label: "Welcome" },
  { value: "no", label: "Best left at home" },
];

export const TOILETS_OPTIONS: { value: RouteFactsFormState["toilets"]; label: string }[] = [
  { value: "", label: "Not checked (hidden)" },
  { value: "at_start", label: "At the start" },
  { value: "on_route", label: "On the route" },
  { value: "none", label: "None on the route" },
];

export const COVERED_OPTIONS: { value: RouteFactsFormState["covered"]; label: string }[] = [
  { value: "", label: "Not checked (hidden)" },
  { value: "none", label: "None of it" },
  { value: "some", label: "Some of it" },
  { value: "most", label: "Most of it" },
];

const str = (v: number | null | undefined): string => (v == null ? "" : String(v));

export function factsToForm(facts: RouteFacts): RouteFactsFormState {
  const sp = facts.startPoint;
  return {
    label: {
      en: sp?.label.en ?? "",
      es: sp?.label.es ?? "",
      fr: sp?.label.fr ?? "",
      de: sp?.label.de ?? "",
      nl: sp?.label.nl ?? "",
    },
    lat: str(sp?.lat),
    lng: str(sp?.lng),
    mapUrl: sp?.mapUrl ?? "",
    distanceKm: str(facts.distanceKm),
    durationMins: str(facts.durationMins),
    stops: str(facts.stops),
    stepFree: facts.stepFree ?? "",
    dogs: facts.dogs == null ? "" : facts.dogs ? "yes" : "no",
    toilets: facts.toilets ?? "",
    covered: facts.covered ?? "",
  };
}

export function isRouteFactsFormDirty(form: RouteFactsFormState, saved: RouteFactsFormState): boolean {
  return JSON.stringify(form) !== JSON.stringify(saved);
}

/** A number field: blank is null, anything else must parse. */
function toNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : "invalid";
}

/** The Google Maps link for the typed coordinates, or null if they aren't valid yet. */
export function mapUrlFromCoordinates(form: Pick<RouteFactsFormState, "lat" | "lng">): string | null {
  const lat = toNumber(form.lat);
  const lng = toNumber(form.lng);
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return googleMapsUrl(lat, lng);
}

/** The link "Open in Google Maps" should use: the typed URL if valid, else the coordinates. */
export function previewMapUrl(form: RouteFactsFormState): string | null {
  const typed = form.mapUrl.trim();
  if (GOOGLE_MAPS_URL_PATTERN.test(typed)) return typed;
  return mapUrlFromCoordinates(form);
}

function startPointBlank(form: RouteFactsFormState): boolean {
  return (
    Object.values(form.label).every((v) => v.trim() === "") &&
    form.lat.trim() === "" &&
    form.lng.trim() === "" &&
    form.mapUrl.trim() === ""
  );
}

/**
 * Validates the form and builds the PUT body, using the same shared schema
 * the API parses. Returns per-field messages when it fails.
 */
export function buildRouteFactsPayload(
  form: RouteFactsFormState,
): { ok: true; payload: RouteFactsInput } | { ok: false; errors: RouteFactsFormErrors } {
  const errors: RouteFactsFormErrors = {};
  const num = (field: "lat" | "lng" | "distanceKm" | "durationMins" | "stops", label: string) => {
    const n = toNumber(form[field]);
    if (n === "invalid") {
      errors[field] = `${label} must be a number`;
      return null;
    }
    return n;
  };

  let startPoint: RouteFactsInput["startPoint"] = null;
  if (!startPointBlank(form)) {
    const lat = num("lat", "Latitude");
    const lng = num("lng", "Longitude");
    if (form.label.en.trim() === "") errors["label.en"] = "English label is required for a start point";
    if (form.lat.trim() === "") errors.lat = "Latitude is required for a start point";
    if (form.lng.trim() === "") errors.lng = "Longitude is required for a start point";
    if (form.mapUrl.trim() === "") errors.mapUrl = "Map URL is required for a start point";
    startPoint = {
      label: { ...form.label },
      lat: lat ?? Number.NaN,
      lng: lng ?? Number.NaN,
      mapUrl: form.mapUrl,
    };
  }

  const body = {
    startPoint,
    distanceKm: num("distanceKm", "Distance"),
    durationMins: num("durationMins", "Walking time"),
    stops: num("stops", "Stops"),
    stepFree: form.stepFree || null,
    dogs: form.dogs === "" ? null : form.dogs === "yes",
    toilets: form.toilets || null,
    covered: form.covered || null,
  };

  const parsed = routeFactsInputSchema.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [head, second, third] = issue.path.map(String);
      let field: RouteFactsFormField;
      if (head === "startPoint") {
        field = second === "label" ? (`label.${third}` as RouteFactsFormField) : ((second ?? "startPoint") as RouteFactsFormField);
      } else {
        field = head as RouteFactsFormField;
      }
      // Keep the first (most specific) message for a field.
      errors[field] ??= issue.message;
    }
  }

  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, payload: parsed.data };
}
