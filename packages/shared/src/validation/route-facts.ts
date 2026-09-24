import { z } from "zod";
import type { SupportedLanguage } from "../types/enums.js";

/**
 * Route facts: the practical, checked-on-the-ground facts about a route
 * family that the marketing site's "Route at a glance" box and key facts
 * show (docs/plans/brand-direction-a.md, Phase 6).
 *
 * Every field is nullable. Null means "not checked yet" and the site hides
 * that row rather than guessing, so a fact only appears once someone has
 * walked the route and entered it in the admin panel.
 *
 * Distance and duration here are the family-level values and are canonical
 * for marketing. The per-language `routes.estimated_*` columns still exist
 * (the completion message quotes them) but the site no longer reads them.
 */

/** Can the whole route be done without steps? "mostly" means with a short detour or a hand. */
export const ROUTE_FACTS_STEP_FREE = ["yes", "mostly", "no"] as const;
/** Where the nearest public toilets are. */
export const ROUTE_FACTS_TOILETS = ["at_start", "on_route", "none"] as const;
/** How much of the walk is under a roof. */
export const ROUTE_FACTS_COVERED = ["none", "some", "most"] as const;

export type RouteFactsStepFree = (typeof ROUTE_FACTS_STEP_FREE)[number];
export type RouteFactsToilets = (typeof ROUTE_FACTS_TOILETS)[number];
export type RouteFactsCovered = (typeof ROUTE_FACTS_COVERED)[number];

export const ROUTE_FACTS_LABEL_MAX_LENGTH = 80;
export const ROUTE_FACTS_MAP_URL_MAX_LENGTH = 500;

/** The only map link form the site renders: `https://maps.google.com/?q=…`. */
export const GOOGLE_MAPS_URL_PATTERN = /^https:\/\/maps\.google\.com\/\?q=\S+$/;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const labelText = z
  .string()
  .trim()
  .min(1, "Start point label is required")
  .max(ROUTE_FACTS_LABEL_MAX_LENGTH, `Start point label must be at most ${ROUTE_FACTS_LABEL_MAX_LENGTH} characters`)
  .refine((v) => !CONTROL_CHARS.test(v), "Start point label must be a single line of text");

/** A translation may be left out (or blank): the site then shows the English label. */
const optionalLabelText = z
  .string()
  .trim()
  .max(ROUTE_FACTS_LABEL_MAX_LENGTH, `Start point label must be at most ${ROUTE_FACTS_LABEL_MAX_LENGTH} characters`)
  .refine((v) => !CONTROL_CHARS.test(v), "Start point label must be a single line of text")
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/**
 * The start point's place name in each language ("City Square"). English is
 * required; the other languages fall back to it when blank.
 */
export const routeFactsLabelSchema = z.object({
  en: labelText,
  es: optionalLabelText,
  fr: optionalLabelText,
  de: optionalLabelText,
  nl: optionalLabelText,
});

export const routeFactsStartPointSchema = z.object({
  label: routeFactsLabelSchema,
  lat: z.number().finite().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90"),
  lng: z.number().finite().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180"),
  mapUrl: z
    .string()
    .trim()
    .max(ROUTE_FACTS_MAP_URL_MAX_LENGTH, `Map URL must be at most ${ROUTE_FACTS_MAP_URL_MAX_LENGTH} characters`)
    .regex(GOOGLE_MAPS_URL_PATTERN, "Map URL must look like https://maps.google.com/?q=…"),
});

/**
 * PUT body for a family's facts. Every key is required (null to clear), so a
 * save replaces the whole set and nothing is left over from before. Unknown
 * keys (such as `updatedAt` echoed back from a GET) are dropped.
 */
export const routeFactsInputSchema = z.object({
  /** Where the game starts. Never a stop: it must not give an answer away. */
  startPoint: routeFactsStartPointSchema.nullable(),
  distanceKm: z
    .number()
    .finite()
    .positive("Distance must be more than 0")
    .max(100, "Distance must be at most 100 km")
    .transform((v) => Math.round(v * 100) / 100)
    .nullable(),
  durationMins: z
    .number()
    .int("Walking time must be a whole number of minutes")
    .min(1, "Walking time must be at least 1 minute")
    .max(1440, "Walking time must be at most 1440 minutes")
    .nullable(),
  /** Number of answer stops. The stops themselves are never named. */
  stops: z
    .number()
    .int("Stops must be a whole number")
    .min(1, "Stops must be at least 1")
    .max(100, "Stops must be at most 100")
    .nullable(),
  stepFree: z.enum(ROUTE_FACTS_STEP_FREE).nullable(),
  dogs: z.boolean().nullable(),
  toilets: z.enum(ROUTE_FACTS_TOILETS).nullable(),
  covered: z.enum(ROUTE_FACTS_COVERED).nullable(),
});

/** The facts as the API returns them: the input plus when they were last saved. */
export const routeFactsSchema = routeFactsInputSchema.extend({
  /** ISO timestamp of the last save, or null when nothing has been entered. */
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type RouteFactsInput = z.input<typeof routeFactsInputSchema>;
export type RouteFactsStartPoint = z.output<typeof routeFactsStartPointSchema>;
export type RouteFacts = z.output<typeof routeFactsSchema>;

/** Facts for a family nobody has filled in yet: everything hidden. */
export const EMPTY_ROUTE_FACTS: RouteFacts = {
  startPoint: null,
  distanceKm: null,
  durationMins: null,
  stops: null,
  stepFree: null,
  dogs: null,
  toilets: null,
  covered: null,
  updatedAt: null,
};

/** A Google Maps link for a coordinate, in the form the schema accepts. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/** The start point's label in a language, falling back to English. */
export function startPointLabel(startPoint: RouteFactsStartPoint, language: SupportedLanguage): string {
  return startPoint.label[language] ?? startPoint.label.en;
}
