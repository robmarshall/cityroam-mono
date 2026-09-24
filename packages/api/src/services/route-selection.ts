import { eq, and, sql } from "drizzle-orm";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from "@cityroam/shared/constants";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { routes } from "../db/schema/index.js";
import { createLogger } from "../lib/logger.js";

/**
 * Which route a purchase (or a voucher redemption) plays. Shared by the game
 * checkout and the voucher redemption so both pick hunts by the same rules.
 */

const log = createLogger("checkout");

// ---------------------------------------------------------------------------
// Route family selection
// ---------------------------------------------------------------------------
/**
 * Route families have no slug column, so marketing segments are mapped to
 * family UUIDs through the CHECKOUT_ROUTE_FAMILY_IDS environment variable.
 *
 * Accepted values:
 *   - a bare UUID — used for every segment
 *   - a JSON object keyed by marketing segment, with an optional "default":
 *     {"default":"<uuid>","hen-parties":"<uuid>","team-building":"<uuid>"}
 *
 * Read lazily (not at module load) so deployments and tests can change it
 * without a restart of the module graph.
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SEGMENT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function segmentFamilyMap(): Record<string, string> {
  const raw = env.CHECKOUT_ROUTE_FAMILY_IDS?.trim();
  if (!raw) return {};

  if (UUID_RE.test(raw)) return { default: raw };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && UUID_RE.test(value.trim())) {
        map[key] = value.trim();
      } else {
        log.warn("ignoring non-UUID entry in CHECKOUT_ROUTE_FAMILY_IDS", { key });
      }
    }
    return map;
  } catch (err) {
    log.error("CHECKOUT_ROUTE_FAMILY_IDS is not a UUID or JSON object — ignoring", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Resolves the route family for a purchase. Never guesses between several
 * candidates: if the mapping is absent it will only use a family that is the
 * single active one in the database.
 */
export async function resolveRouteFamilyId(
  explicitFamilyId: string | undefined,
  segment: string | undefined,
): Promise<{ familyId: string; source: string } | null> {
  if (explicitFamilyId) {
    return { familyId: explicitFamilyId, source: "request" };
  }

  const map = segmentFamilyMap();
  if (segment && map[segment]) {
    return { familyId: map[segment], source: `segment:${segment}` };
  }
  if (map.default) {
    return { familyId: map.default, source: "segment:default" };
  }

  // No mapping configured. Only safe if the database offers exactly one
  // choice — otherwise the buyer would get an arbitrary hunt.
  const activeRoutes = await db.query.routes.findMany({
    where: and(eq(routes.is_active, true), ROUTE_HAS_GROUPS),
    columns: { route_family_id: true },
  });
  const familyIds = [...new Set(activeRoutes.map((r) => r.route_family_id))];

  if (familyIds.length === 1) {
    log.warn(
      "CHECKOUT_ROUTE_FAMILY_IDS is unset — using the only active route family",
      { familyId: familyIds[0], segment: segment ?? null },
    );
    return { familyId: familyIds[0], source: "sole-active-family" };
  }

  log.error("cannot resolve a route family for checkout", {
    segment: segment ?? null,
    activeFamilyCount: familyIds.length,
    mappingConfigured: Object.keys(map).length > 0,
  });
  return null;
}

/**
 * A route with no groups is not a hunt: `startEvent` fails with "Route has no
 * groups" the moment the lead presses start, after the money has changed
 * hands. An empty active route is easy to create — a fresh route defaults to
 * active and has no groups until content is added — so checkout refuses to see
 * one rather than trusting `is_active` alone.
 *
 * The subquery names route_groups literally: inside a relational-query `where`
 * drizzle rewrites every column reference to the outer table's alias, so a
 * `routeGroups.route_id` chunk would silently become `routes.route_id`.
 */
export const ROUTE_HAS_GROUPS = sql`EXISTS (SELECT 1 FROM "route_groups" AS g WHERE g."route_id" = ${routes.id})`;

/**
 * Finds the sellable route for a family in the requested language, falling back
 * to the English variant *of the same family* only. Sellable means active and
 * carrying at least one group.
 */
export async function resolveRouteInFamily(familyId: string, language: string) {
  const exact = await db.query.routes.findFirst({
    where: and(
      eq(routes.route_family_id, familyId),
      eq(routes.language, language),
      eq(routes.is_active, true),
      ROUTE_HAS_GROUPS,
    ),
  });
  if (exact) return exact;

  if (language === DEFAULT_LANGUAGE) return null;

  return (
    (await db.query.routes.findFirst({
      where: and(
        eq(routes.route_family_id, familyId),
        eq(routes.language, DEFAULT_LANGUAGE),
        eq(routes.is_active, true),
        ROUTE_HAS_GROUPS,
      ),
    })) ?? null
  );
}

export function normaliseLanguage(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_LANGUAGE;
  const lower = value.trim().toLowerCase().slice(0, 5);
  const base = lower.split(/[-_]/)[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? base
    : DEFAULT_LANGUAGE;
}
