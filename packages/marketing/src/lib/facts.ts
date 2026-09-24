import {
  formatGBP,
  LINK_VALID_DAYS,
  MAX_PARTICIPANTS,
  PRICE_GBP,
  ROUTE_FACTS,
} from "./site";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The route numbers the copy quotes. Pages load them from the API (the
 * family's route facts, lib/load-route-facts.ts) and pass them down; a
 * missing or null number falls back to ROUTE_FACTS, so every string always
 * has a value.
 */
export type QuotedRouteFacts = {
  distanceKm?: number | null;
  durationMins?: number | null;
  stops?: number | null;
};

/**
 * Values for the `facts.*` messages and for any message that quotes the
 * price, group size, duration, distance or number of stops. Price, group
 * size and link validity come from lib/site.ts; the route numbers from the
 * `route` argument (the loaded route facts), falling back to lib/site.ts, so
 * the numbers can't drift between pages as long as every page passes the
 * same facts.
 *
 * `t` is a translator for the `facts` namespace.
 */
export function factValues(t: Translate, route: QuotedRouteFacts = {}) {
  const hours = (route.durationMins ?? ROUTE_FACTS.durationMins) / 60;
  const km = route.distanceKm ?? ROUTE_FACTS.distanceKm;
  const base = {
    price: formatGBP(PRICE_GBP),
    // Rounded to the nearest pound: £2.90 reads as "about £3".
    perHead: formatGBP(Math.round(PRICE_GBP / MAX_PARTICIPANTS)),
    max: MAX_PARTICIPANTS,
    days: LINK_VALID_DAYS,
    hours,
    km,
    miles: Math.round(km * 0.621371 * 10) / 10,
    stops: route.stops ?? ROUTE_FACTS.stops,
  };
  return {
    ...base,
    duration: t("durationInline", base),
    distance: t("distance", base),
  };
}

export type FactValues = ReturnType<typeof factValues>;
