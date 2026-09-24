import type { RouteFacts } from "../validation/route-facts.js";

export type {
  RouteFacts,
  RouteFactsInput,
  RouteFactsStartPoint,
  RouteFactsStepFree,
  RouteFactsToilets,
  RouteFactsCovered,
} from "../validation/route-facts.js";

/** GET/PUT /admin/route-families/:id/facts */
export interface AdminRouteFactsResponse {
  route_family_id: string;
  facts: RouteFacts;
}

/**
 * GET /public/route-families/:id/facts. Only the facts: no ids, names or
 * anything else about the family.
 */
export interface PublicRouteFactsResponse {
  facts: RouteFacts;
}
