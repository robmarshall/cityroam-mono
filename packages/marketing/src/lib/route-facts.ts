import type { RouteFacts } from "@cityroam/shared/route-facts";
import { ROUTE_FACTS } from "./site";

/**
 * What the "Route at a glance" box can say about a route. The type and its
 * schema live in @cityroam/shared (the API, the admin form and the MCP tools
 * use the same ones). Every field is nullable: a null row is hidden rather
 * than guessed, so the box only ever shows what has been checked on the
 * ground.
 *
 * Since Phase 6 of docs/plans/brand-direction-a.md the facts come from the
 * database (admin > Route families > Route facts) through the public
 * endpoint; see lib/load-route-facts.ts. The constants below are the
 * fallback when the API can't be reached or a fact is unset.
 */
export type { RouteFacts } from "@cityroam/shared/route-facts";

/**
 * The Leeds route's fallback. Distance, duration and the stop count come
 * from the seed route in packages/api/src/db/seed-routes.ts, through
 * ROUTE_FACTS, so they match every other page. Everything else is null
 * (hidden) until it is entered in admin after the route walk.
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
  updatedAt: null,
};

/**
 * The API's facts over the fallback, fact by fact: whatever the API has set
 * wins, and a null (or no answer at all) keeps the fallback's value.
 */
export function mergeRouteFacts(fromApi: RouteFacts | null, fallback: RouteFacts = LEEDS_ROUTE_FACTS): RouteFacts {
  if (!fromApi) return fallback;
  return {
    startPoint: fromApi.startPoint ?? fallback.startPoint,
    distanceKm: fromApi.distanceKm ?? fallback.distanceKm,
    durationMins: fromApi.durationMins ?? fallback.durationMins,
    stops: fromApi.stops ?? fallback.stops,
    stepFree: fromApi.stepFree ?? fallback.stepFree,
    dogs: fromApi.dogs ?? fallback.dogs,
    toilets: fromApi.toilets ?? fallback.toilets,
    covered: fromApi.covered ?? fallback.covered,
    updatedAt: fromApi.updatedAt ?? fallback.updatedAt,
  };
}
