import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import {
  ROUTE_FACTS_COVERED,
  ROUTE_FACTS_STEP_FREE,
  ROUTE_FACTS_TOILETS,
  type RouteFacts,
} from "@cityroam/shared/route-facts";
import { locales } from "@/i18n/config";
import { factValues } from "@/lib/facts";
import { loadRouteFacts, routeFactsUrl, ROUTE_FACTS_REVALIDATE_SECONDS } from "@/lib/load-route-facts";
import { LEEDS_ROUTE_FACTS, mergeRouteFacts } from "@/lib/route-facts";
import { ROUTE_FACTS } from "@/lib/site";

const FAMILY = "11111111-1111-4111-8111-111111111111";
const env = { NEXT_PUBLIC_API_URL: "https://api.example.test/", ROUTE_FACTS_FAMILY_ID: FAMILY };
const URL_ = `https://api.example.test/public/route-families/${FAMILY}/facts`;

const fromApi: RouteFacts = {
  startPoint: {
    label: { en: "City Square", es: null, fr: "Place de la Ville", de: null, nl: null },
    lat: 53.7963,
    lng: -1.5477,
    mapUrl: "https://maps.google.com/?q=53.7963,-1.5477",
  },
  distanceKm: 2.8,
  durationMins: null,
  stops: null,
  stepFree: "mostly",
  dogs: true,
  toilets: null,
  covered: "some",
  updatedAt: "2026-09-24T10:00:00.000Z",
};

const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => vi.restoreAllMocks());

describe("route facts source", () => {
  it("needs both the family id and the API URL, and uses neither when one is missing", () => {
    expect(routeFactsUrl(env)).toBe(URL_);
    expect(routeFactsUrl({ ...env, ROUTE_FACTS_FAMILY_ID: " " })).toBeNull();
    expect(routeFactsUrl({ ROUTE_FACTS_FAMILY_ID: FAMILY })).toBeNull();
  });

  it("uses the built-in facts without a request when unconfigured (local dev, CI)", async () => {
    const fetchImpl = answer({ facts: fromApi });
    expect(await loadRouteFacts(fetchImpl as unknown as typeof fetch, {})).toBe(LEEDS_ROUTE_FACTS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the public endpoint with hourly revalidation and merges fact by fact", async () => {
    const fetchImpl = answer({ facts: fromApi });
    const facts = await loadRouteFacts(fetchImpl as unknown as typeof fetch, env);
    expect(fetchImpl).toHaveBeenCalledWith(URL_, expect.objectContaining({ next: { revalidate: 3600 } }));
    expect(ROUTE_FACTS_REVALIDATE_SECONDS).toBe(3600);
    // Set in the API: wins.
    expect(facts.distanceKm).toBe(2.8);
    expect(facts.startPoint?.label.fr).toBe("Place de la Ville");
    expect(facts.stepFree).toBe("mostly");
    // Null in the API: the fallback stays.
    expect(facts.durationMins).toBe(ROUTE_FACTS.durationMins);
    expect(facts.stops).toBe(ROUTE_FACTS.stops);
    expect(facts.toilets).toBeNull();
  });

  it.each([
    ["the API is unreachable", vi.fn(async () => { throw new TypeError("fetch failed"); })],
    ["the family has no active route (404)", answer({ error: "Route family not found" }, 404)],
    ["the body fails the shared schema", answer({ facts: { ...fromApi, stepFree: "partly" } })],
    ["the body has no facts", answer({})],
  ])("falls back to the built-in facts when %s", async (_why, fetchImpl) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadRouteFacts(fetchImpl as unknown as typeof fetch, env)).toEqual(LEEDS_ROUTE_FACTS);
  });

  it("merges nothing over the fallback when the API has nothing", () => {
    expect(mergeRouteFacts(null)).toBe(LEEDS_ROUTE_FACTS);
    const allNull = Object.fromEntries(Object.keys(LEEDS_ROUTE_FACTS).map((k) => [k, null])) as RouteFacts;
    expect(mergeRouteFacts(allNull)).toEqual(LEEDS_ROUTE_FACTS);
  });
});

describe("route facts copy", () => {
  const messagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../messages");
  const load = (locale: string) => JSON.parse(readFileSync(path.join(messagesDir, `${locale}.json`), "utf8"));

  it("has a line for every value the shared schema allows, in every locale", () => {
    for (const locale of locales) {
      const values = load(locale).home.route.values;
      expect(Object.keys(values.stepFree).sort(), locale).toEqual([...ROUTE_FACTS_STEP_FREE].sort());
      expect(Object.keys(values.toilets).sort(), locale).toEqual([...ROUTE_FACTS_TOILETS].sort());
      expect(Object.keys(values.covered).sort(), locale).toEqual([...ROUTE_FACTS_COVERED].sort());
      expect(Object.keys(values.dogs).sort(), locale).toEqual(["no", "yes"]);
    }
  });

  it("quotes the loaded distance, walking time and stops in the fact strings", () => {
    const messages = load("en");
    const t = createTranslator({ locale: "en", messages, namespace: "facts" }) as unknown as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;
    const values = factValues(t, { distanceKm: 3.2, durationMins: 90, stops: 5 });
    expect(values.km).toBe(3.2);
    expect(values.hours).toBe(1.5);
    expect(values.stops).toBe(5);
    expect(values.distance).toContain("3.2");

    // Null (unset in admin) keeps the built-in number rather than a gap.
    const fallback = factValues(t, { distanceKm: null, durationMins: null, stops: null });
    expect(fallback.km).toBe(ROUTE_FACTS.distanceKm);
    expect(fallback.stops).toBe(ROUTE_FACTS.stops);
  });
});
