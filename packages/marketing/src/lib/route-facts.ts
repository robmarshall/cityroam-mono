import { ROUTE_FACTS } from "./site";

/**
 * What the "Route at a glance" box can say about a route. Every field is
 * nullable: a null row is hidden rather than guessed, so the box only ever
 * shows what has been checked on the ground.
 *
 * Phase 6 of docs/plans/brand-direction-a.md moves these into the database
 * (an admin form plus a public endpoint); this type is the shape that
 * endpoint should return.
 */
export type RouteFacts = {
  /** Where the game starts, as a place name ("City Square"). Never a stop. */
  startPoint: string | null;
  distanceKm: number | null;
  durationMins: number | null;
  /** Number of answer stops. The stops themselves are never named. */
  stops: number | null;
  /** Can the whole route be done without steps? "partly" means with a detour or help. */
  stepFree: "yes" | "partly" | "no" | null;
  dogs: boolean | null;
  /** Public toilets on or right beside the route. */
  toilets: boolean | null;
  /** How much of the walk is under a roof (the arcades, mostly). */
  covered: "most" | "some" | "little" | null;
};

/**
 * The Leeds route. Distance, duration and the stop count come from the seed
 * route in packages/api/src/db/seed-routes.ts, through ROUTE_FACTS, so they
 * match every other page.
 *
 * TODO(Rob): fill in the rest after walking the live route. The start point
 * is still open: the introduction currently sends players to the first
 * answer, so pick a meeting place that isn't a stop (City Square, Millennium
 * Square or Victoria Gardens were the candidates in the shot list).
 */
export const LEEDS_ROUTE_FACTS: RouteFacts = {
  startPoint: null,
  distanceKm: ROUTE_FACTS.distanceKm,
  durationMins: ROUTE_FACTS.durationMins,
  stops: ROUTE_FACTS.stops,
  stepFree: null,
  dogs: null,
  toilets: null,
  covered: null,
};
