import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import type {
  AdminRouteFactsResponse,
  PublicRouteFactsResponse,
  RouteFacts,
  RouteFactsCovered,
  RouteFactsStepFree,
  RouteFactsToilets,
  SupportedLanguage,
} from "@cityroam/shared/types";
import { EMPTY_ROUTE_FACTS, routeFactsInputSchema } from "@cityroam/shared/validation";
import { db } from "../db/index.js";
import { routeFamilies, routeFamilyFacts, routes } from "../db/schema/index.js";
import { AppError } from "../middleware/error-handler.js";
import { requireAdmin } from "../middleware/admin.js";
import { clientIp } from "../lib/client-ip.js";
import { createLogger } from "../lib/logger.js";
import { checkPublicRouteFactsRateLimit } from "../redis/rate-limit.js";
import { UUID_RE } from "../services/route-selection.js";

/**
 * Route facts (docs/plans/brand-direction-a.md, Phase 6): what the marketing
 * site's "Route at a glance" box says about a route family.
 *
 * - GET/PUT /admin/route-families/:id/facts, behind requireAdmin with the
 *   routes:read / routes:write scopes (PUTs land in the audit log).
 * - GET /public/route-families/:id/facts, read-only and rate limited, for
 *   the marketing build. Only families with an active route answer.
 */
export const routeFactsRoutes = new Hono();

const log = createLogger("route-facts");

/** Cached by the marketing site's ISR and any CDN for five minutes. */
export const PUBLIC_ROUTE_FACTS_CACHE_CONTROL = "public, max-age=300";

type FactsRow = typeof routeFamilyFacts.$inferSelect;

export function rowToFacts(row: FactsRow | null | undefined): RouteFacts {
  if (!row) return { ...EMPTY_ROUTE_FACTS };
  const label = row.start_label;
  const startPoint =
    label && row.start_lat != null && row.start_lng != null && row.start_map_url
      ? {
          label: {
            en: label.en ?? "",
            es: label.es ?? null,
            fr: label.fr ?? null,
            de: label.de ?? null,
            nl: label.nl ?? null,
          },
          lat: row.start_lat,
          lng: row.start_lng,
          mapUrl: row.start_map_url,
        }
      : null;
  return {
    startPoint,
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    durationMins: row.duration_mins,
    stops: row.stops,
    stepFree: row.step_free as RouteFactsStepFree | null,
    dogs: row.dogs,
    toilets: row.toilets as RouteFactsToilets | null,
    covered: row.covered as RouteFactsCovered | null,
    updatedAt: row.updated_at.toISOString(),
  };
}

function familyId(c: Context): string {
  const id = c.req.param("id") ?? "";
  // A malformed id would otherwise reach Postgres as an invalid uuid and 500.
  if (!UUID_RE.test(id)) {
    throw new AppError(404, "Route family not found", "ROUTE_FAMILY_NOT_FOUND");
  }
  return id;
}

async function assertFamilyExists(id: string): Promise<void> {
  const family = await db.query.routeFamilies.findFirst({
    where: eq(routeFamilies.id, id),
    columns: { id: true },
  });
  if (!family) {
    throw new AppError(404, "Route family not found", "ROUTE_FAMILY_NOT_FOUND");
  }
}

async function loadFacts(id: string): Promise<RouteFacts> {
  const row = await db.query.routeFamilyFacts.findFirst({
    where: eq(routeFamilyFacts.route_family_id, id),
  });
  return rowToFacts(row);
}

// GET /admin/route-families/:id/facts — the facts, all null until first saved
routeFactsRoutes.get("/admin/route-families/:id/facts", requireAdmin("routes:read"), async (c) => {
  const id = familyId(c);
  await assertFamilyExists(id);
  const response: AdminRouteFactsResponse = { route_family_id: id, facts: await loadFacts(id) };
  return c.json(response, 200);
});

// PUT /admin/route-families/:id/facts — replace the whole set (null clears a fact)
routeFactsRoutes.put("/admin/route-families/:id/facts", requireAdmin("routes:write"), async (c) => {
  const id = familyId(c);
  await assertFamilyExists(id);

  const body = await c.req.json().catch(() => {
    throw new AppError(400, "Body must be JSON", "INVALID_INPUT");
  });
  const parsed = routeFactsInputSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
      .join("; ");
    throw new AppError(400, message, "INVALID_INPUT");
  }
  const facts = parsed.data;
  const start = facts.startPoint;

  const values = {
    start_label: start ? (start.label as Record<SupportedLanguage, string | null>) : null,
    start_lat: start?.lat ?? null,
    start_lng: start?.lng ?? null,
    start_map_url: start?.mapUrl ?? null,
    distance_km: facts.distanceKm,
    duration_mins: facts.durationMins,
    stops: facts.stops,
    step_free: facts.stepFree,
    dogs: facts.dogs,
    toilets: facts.toilets,
    covered: facts.covered,
    updated_at: new Date(),
  };

  const [row] = await db
    .insert(routeFamilyFacts)
    .values({ route_family_id: id, ...values })
    .onConflictDoUpdate({ target: routeFamilyFacts.route_family_id, set: values })
    .returning();

  log.info("route facts saved", { routeFamilyId: id });
  const response: AdminRouteFactsResponse = { route_family_id: id, facts: rowToFacts(row) };
  return c.json(response, 200);
});

// GET /public/route-families/:id/facts — read-only, for the marketing site
routeFactsRoutes.get("/public/route-families/:id/facts", async (c) => {
  const ip = clientIp(c);
  const limit = await checkPublicRouteFactsRateLimit(ip);
  if (!limit.allowed) {
    log.warn("public route facts rate limited", { ip, requests: limit.current });
    c.header("Retry-After", String(limit.retryAfterSeconds));
    throw new AppError(429, "Too many requests. Try again later.", "RATE_LIMITED");
  }

  const id = familyId(c);

  // A family nobody can buy (no active route) is not public: same 404 as an
  // unknown id, so drafts can't be probed.
  const [active] = await db
    .select({ id: routes.id })
    .from(routes)
    .where(and(eq(routes.route_family_id, id), eq(routes.is_active, true)))
    .limit(1);
  if (!active) {
    throw new AppError(404, "Route family not found", "ROUTE_FAMILY_NOT_FOUND");
  }

  const response: PublicRouteFactsResponse = { facts: await loadFacts(id) };
  c.header("Cache-Control", PUBLIC_ROUTE_FACTS_CACHE_CONTROL);
  return c.json(response, 200);
});
