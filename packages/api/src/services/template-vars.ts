import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { guideNameFor } from "@cityroam/shared/constants";
import { env } from "../env.js";

/**
 * Variables whose value is a lower-case noun phrase in running text
 * ("the Owl", "el Búho") and so must be capitalised when they open a
 * sentence. Never add a URL or an answer here: capitalising those would
 * change them.
 */
const SENTENCE_CASE_VARS = new Set(["GUIDE_NAME"]);

/**
 * True when `before` (the text preceding a placeholder) leaves the placeholder
 * at the start of a sentence: the start of the content, a new line, or after
 * ". ", "! ", "? " or "… " (closing quotes and brackets allowed before the
 * space). Opening quotes, brackets and Spanish ¿ ¡ may sit directly in front.
 */
function opensSentence(before: string): boolean {
  return /(?:^\s*|\n\s*|[.!?…]["'”’»)\]]*\s+)["'“‘«„¿¡(\[]*$/u.test(before);
}

function capitaliseFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Replace all {{KEY}} placeholders in content with values from the vars map.
 * Placeholders with no value are left intact. Replacement is a single pass, so
 * a value that itself contains "{{...}}" is not expanded again.
 *
 * `{{GUIDE_NAME}}` (see SENTENCE_CASE_VARS) is capitalised when it starts a
 * sentence: "I'm {{GUIDE_NAME}}." gives "I'm the Owl.", while
 * "{{GUIDE_NAME}} knows." gives "The Owl knows."
 */
export function applyTemplateVars(
  content: string,
  vars: Record<string, string>,
): string {
  return content.replace(/\{\{([^{}]+)\}\}/g, (match, key: string, offset: number) => {
    if (!Object.hasOwn(vars, key)) return match;
    const value = vars[key];
    return SENTENCE_CASE_VARS.has(key) && opensSentence(content.slice(0, offset))
      ? capitaliseFirst(value)
      : value;
  });
}

/**
 * Build the standard template variables for a route.
 * Used by completion messages, message blocks, hint text and en-route directions.
 *
 * `{{GUIDE_NAME}}` is the guide's name in the event's language, in its
 * running-text form ("the Owl", "die Eule"); applyTemplateVars capitalises it
 * at the start of a sentence. Pass the
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
    GUIDE_NAME: guideNameFor(language ?? route.language).inSentence,
  };
}
