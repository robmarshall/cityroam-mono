import {
  formatGBP,
  LINK_VALID_DAYS,
  MAX_PARTICIPANTS,
  PRICE_GBP,
  ROUTE_FACTS,
} from "./site";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Values for the `facts.*` messages and for any message that quotes the
 * price, group size, duration or distance. Everything comes from the
 * constants in lib/site.ts so the numbers can't drift between pages.
 *
 * `t` is a translator for the `facts` namespace.
 */
export function factValues(t: Translate) {
  const hours = ROUTE_FACTS.durationMins / 60;
  const km = ROUTE_FACTS.distanceKm;
  const base = {
    price: formatGBP(PRICE_GBP),
    // Rounded to the nearest pound: £2.90 reads as "about £3".
    perHead: formatGBP(Math.round(PRICE_GBP / MAX_PARTICIPANTS)),
    max: MAX_PARTICIPANTS,
    days: LINK_VALID_DAYS,
    hours,
    km,
    miles: Math.round(km * 0.621371 * 10) / 10,
  };
  return {
    ...base,
    duration: t("durationInline", base),
    distance: t("distance", base),
  };
}

export type FactValues = ReturnType<typeof factValues>;
