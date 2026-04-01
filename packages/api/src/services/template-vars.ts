import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
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
 * Used by opening messages, completion messages, and message blocks.
 */
export async function buildRouteTemplateVars(
  routeId: string,
): Promise<Record<string, string>> {
  const route = await db.query.routes.findFirst({
    where: eq(schema.routes.id, routeId),
    columns: {
      city: true,
      total_stops: true,
      estimated_distance_km: true,
    },
  });

  if (!route) return {};

  return {
    CITY_NAME: route.city,
    TOTAL_STOPS: String(route.total_stops),
    DISTANCE_KM: String(route.estimated_distance_km),
    REVIEW_LINK: env.REVIEW_LINK,
  };
}
