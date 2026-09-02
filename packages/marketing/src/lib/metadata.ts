import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales, defaultLocale } from "@/i18n/config";
import { SITE_NAME, siteUrl } from "./site";

/** Every indexable page, mapped to its path and to its message keys. */
export const PAGES = {
  home: { path: "", key: "metadata.home" },
  families: { path: "/families", key: "metadata.families" },
  henParties: { path: "/hen-parties", key: "metadata.henParties" },
  teamBuilding: { path: "/team-building", key: "metadata.teamBuilding" },
  terms: { path: "/terms", key: "legal.meta.terms" },
  privacy: { path: "/privacy", key: "legal.meta.privacy" },
  refunds: { path: "/refunds", key: "legal.meta.refunds" },
} as const;

export type PageKey = keyof typeof PAGES;

/**
 * Per-page metadata: canonical URL, hreflang alternates for every locale, and
 * page-specific Open Graph / Twitter blocks. Without this each page inherited
 * the root layout's Open Graph tags, so every share looked like the homepage.
 *
 * The og:image and twitter:image tags point at the file-based
 * `opengraph-image` / `twitter-image` routes in `src/app/[locale]/`.
 */
export async function buildMetadata(
  locale: string,
  page: PageKey,
): Promise<Metadata> {
  const { path, key } = PAGES[page];
  const t = await getTranslations({ locale });

  const title = t(`${key}.title`);
  const description = t(`${key}.description`);
  const canonical = `${siteUrl}/${locale}${path}`;

  // The share card is generated per locale by the file-based `opengraph-image`
  // / `twitter-image` routes. Next only attaches those automatically to the
  // segment they live in, so nested pages reference them explicitly.
  const ogImage = {
    url: `${siteUrl}/${locale}/opengraph-image`,
    width: 1200,
    height: 630,
    alt: SITE_NAME,
  };

  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical,
      languages: Object.fromEntries([
        ["x-default", `${siteUrl}/${defaultLocale}${path}`],
        ...locales.map((l) => [l, `${siteUrl}/${l}${path}`]),
      ]),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale,
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/${locale}/twitter-image`],
    },
  };
}
