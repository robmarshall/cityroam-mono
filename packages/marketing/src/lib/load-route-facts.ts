import { routeFactsSchema, type RouteFacts } from "@cityroam/shared/route-facts";
import { LEEDS_ROUTE_FACTS, mergeRouteFacts } from "./route-facts";

/** How often a page re-reads the facts (ISR). Pages that call loadRouteFacts export the same value. */
export const ROUTE_FACTS_REVALIDATE_SECONDS = 3600;

/** A build (or revalidation) never waits longer than this for the API. */
const TIMEOUT_MS = 5000;

type Env = Record<string, string | undefined>;

/**
 * Where to read the facts from. ROUTE_FACTS_FAMILY_ID is server-only (read at
 * build and revalidation time, never shipped to the browser); the API base is
 * the same NEXT_PUBLIC_API_URL checkout uses. Either unset means "use the
 * built-in facts", so local dev and CI need neither.
 */
export function routeFactsUrl(env: Env = process.env): string | null {
  const familyId = env.ROUTE_FACTS_FAMILY_ID?.trim();
  const api = env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (!familyId || !api) return null;
  return `${api}/public/route-families/${encodeURIComponent(familyId)}/facts`;
}

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[route-facts] ${message}; using the built-in facts.`);
}

/**
 * The Leeds route facts for the "Route at a glance" box, key facts and every
 * string that quotes the distance, walking time or stop count.
 *
 * Read from the public API at build time and cached for an hour
 * (`revalidate`), merged fact by fact over LEEDS_ROUTE_FACTS. Anything going
 * wrong (no config, API down, a 404 because no route is active, a body that
 * fails the shared schema) falls back to the constants, so a build never
 * fails on it.
 */
export async function loadRouteFacts(
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<RouteFacts> {
  const url = routeFactsUrl(env);
  if (!url) return LEEDS_ROUTE_FACTS;

  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: ROUTE_FACTS_REVALIDATE_SECONDS },
    } as RequestInit);
    if (!res.ok) {
      warnOnce(`${url} answered ${res.status}`);
      return LEEDS_ROUTE_FACTS;
    }
    const body = (await res.json()) as { facts?: unknown };
    const parsed = routeFactsSchema.safeParse(body?.facts);
    if (!parsed.success) {
      warnOnce(`${url} returned facts that fail the shared schema`);
      return LEEDS_ROUTE_FACTS;
    }
    return mergeRouteFacts(parsed.data);
  } catch (err) {
    warnOnce(`could not reach ${url} (${err instanceof Error ? err.message : String(err)})`);
    return LEEDS_ROUTE_FACTS;
  }
}
