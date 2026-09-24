/** Canonical site-wide constants shared by metadata, sitemap and UI. */

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

export const SITE_NAME = "City Roam";

/**
 * Contact address shown in the footer and the legal pages. Kept on the same
 * domain as the site itself (cityroam.co.uk) so the two never disagree.
 */
export const CONTACT_EMAIL = "hello@cityroam.co.uk";

/**
 * Launch price in pounds, per group. The charge itself comes from the Stripe
 * price configured on the API (STRIPE_PRICE_ID); this copy feeds the JSON-LD
 * offer and analytics, and must be kept in step with it and with the
 * `home.pricing.price` message.
 */
export const PRICE_GBP = 29;

/** Players allowed on one booking; the API rejects the next one to join. */
export { MAX_PARTICIPANTS } from "@cityroam/shared/constants";

/** Days a game link works for, counted from booking. */
export { EVENT_EXPIRY_DAYS as LINK_VALID_DAYS } from "@cityroam/shared/constants";

/**
 * Duration and distance quoted on the site (hero facts strip, FAQs, audience
 * pages). Taken from the Leeds seed route in
 * packages/api/src/db/seed-routes.ts (estimated_duration_mins: 60,
 * estimated_distance_km: "2.5").
 *
 * TODO(Rob): confirm both after walking the live route. The copy reads them
 * from here, so changing these two numbers updates every page and locale.
 */
export const ROUTE_FACTS = {
  durationMins: 60,
  distanceKm: 2.5,
} as const;

/** "£29" style price label. Every locale shows sterling the same way. */
export function formatGBP(amount: number): string {
  return `£${amount}`;
}

/** Brand palette, mirrored from packages/shared/src/tailwind/preset.css. */
export const BRAND = {
  blue500: "#007AFF",
  blue600: "#0062CC",
  blue900: "#001833",
  ink: "#111827",
  white: "#FFFFFF",
} as const;
