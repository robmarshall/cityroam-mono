/** Canonical site-wide constants shared by metadata, sitemap and UI. */

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

export const SITE_NAME = "City Roam";

/**
 * Contact address shown in the footer and the legal pages. Kept on the same
 * domain as the site itself (cityroam.co.uk) so the two never disagree.
 */
export const CONTACT_EMAIL = "hello@cityroam.co.uk";

/** Brand palette, mirrored from packages/shared/src/tailwind/preset.css. */
export const BRAND = {
  blue500: "#007AFF",
  blue600: "#0062CC",
  blue900: "#001833",
  ink: "#111827",
  white: "#FFFFFF",
} as const;
