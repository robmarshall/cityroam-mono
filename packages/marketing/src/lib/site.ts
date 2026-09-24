/** Canonical site-wide constants shared by metadata, sitemap and UI. */

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

export const SITE_NAME = "City Roam";

/**
 * Contact address shown in the footer and the legal pages. Kept on the same
 * domain as the site itself (cityroam.co.uk) so the two never disagree.
 */
export const CONTACT_EMAIL = "hello@cityroam.co.uk";

/**
 * The legal entity behind City Roam. UK company law (the Company, LLP and
 * Business Names (Miscellaneous Provisions) Regulations 2015) requires the
 * name, place of registration, number and registered office on the website.
 * The footer and the JSON-LD read them from here; the legal pages carry the
 * same details as plain text in messages/*.json (a test keeps them in step).
 */
export const COMPANY = {
  name: "PRL Digital Ltd",
  registeredIn: "England and Wales",
  number: "13705806",
  address: {
    street: "61 Bridge Street",
    locality: "Kington",
    postalCode: "HR5 3DJ",
    country: "GB",
  },
} as const;

/** "61 Bridge Street, Kington, HR5 3DJ": the registered office on one line. */
export const COMPANY_ADDRESS_LINE = [
  COMPANY.address.street,
  COMPANY.address.locality,
  COMPANY.address.postalCode,
].join(", ");

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
 * Duration, distance and stop count quoted on the site (hero facts strip,
 * route at a glance, FAQs, audience pages). Taken from the Leeds seed route
 * in packages/api/src/db/seed-routes.ts (estimated_duration_mins: 60,
 * estimated_distance_km: "2.5", four answer groups).
 *
 * TODO(Rob): confirm duration and distance after walking the live route. The
 * copy reads them from here, so changing a number updates every page and
 * locale.
 */
export const ROUTE_FACTS = {
  durationMins: 60,
  distanceKm: 2.5,
  /** Answer stops after the introduction (4 groups in the seed route). */
  stops: 4,
} as const;

/** "£29" style price label. Every locale shows sterling the same way. */
export function formatGBP(amount: number): string {
  return `£${amount}`;
}

/**
 * Brand palette, mirrored from packages/shared/src/tailwind/preset.css for
 * code that can't use Tailwind classes (share images, icons, the contrast
 * test). Never put brick text or buttons on ink900 (2.93:1); see
 * docs/plans/brand-direction-a.md.
 */
export const BRAND = {
  stone50: "#F5F1EA",
  stone100: "#ECE6DB",
  stone200: "#DDD5C6",
  stone300: "#C9BEAB",
  ink500: "#4A5670",
  ink700: "#2A3654",
  ink900: "#14213D",
  brick100: "#F3DDD5",
  brick500: "#B5452B",
  brick600: "#9A3A24",
  muted: "#5C5A55",
  white: "#FFFFFF",
} as const;
