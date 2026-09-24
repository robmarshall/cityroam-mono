import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { guideNameFor } from "@cityroam/shared/constants";
import { env } from "../env.js";

/**
 * Replace all {{KEY}} placeholders in content with values from the vars map.
 */
export function applyTemplateVars(
  content: string,
  vars: Record<string, string>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Build the standard template variables for a route.
 * Used by completion messages, message blocks, hint text and en-route directions.
 *
 * `{{GUIDE_NAME}}` is the guide's name in the event's language. Pass the
 * event's language when the caller has it; otherwise the route's own language
 * is used (an event is always assigned a route in its language).
 */
export async function buildRouteTemplateVars(
  routeId: string,
  language?: string,
): Promise<Record<string, string>> {
  const route = await db.query.routes.findFirst({
    where: eq(schema.routes.id, routeId),
    columns: {
      route_family_id: true,
      total_stops: true,
      estimated_distance_km: true,
      language: true,
    },
  });

  if (!route) return {};

  // Look up city from route family
  const family = await db.query.routeFamilies.findFirst({
    where: eq(schema.routeFamilies.id, route.route_family_id),
    columns: { city: true },
  });

  return {
    CITY_NAME: family?.city ?? "",
    TOTAL_STOPS: String(route.total_stops),
    DISTANCE_KM: String(route.estimated_distance_km),
    REVIEW_LINK: env.REVIEW_LINK,
    GUIDE_NAME: guideNameFor(language ?? route.language),
  };
}
