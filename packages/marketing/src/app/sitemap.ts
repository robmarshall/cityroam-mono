import type { MetadataRoute } from "next";
import { locales, defaultLocale } from "@/i18n/config";
import { PAGES, type PageKey } from "@/lib/metadata";
import { siteUrl } from "@/lib/site";

/**
 * Marketing pages move with each release, so they report the build date.
 * Legal pages carry a fixed date that matches the "last updated" line rendered
 * on the page itself — a build date there would falsely claim the terms had
 * changed.
 */
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const LEGAL_LAST_MODIFIED = "2026-09-02";

const LEGAL_PAGES = new Set<PageKey>(["terms", "privacy", "refunds"]);

export default function sitemap(): MetadataRoute.Sitemap {
  return (Object.keys(PAGES) as PageKey[]).map((page) => {
    const path = PAGES[page].path;
    const isLegal = LEGAL_PAGES.has(page);

    return {
      url: `${siteUrl}/${defaultLocale}${path}`,
      lastModified: isLegal ? LEGAL_LAST_MODIFIED : BUILD_DATE,
      changeFrequency: isLegal ? ("yearly" as const) : ("weekly" as const),
      priority: page === "home" ? 1 : isLegal ? 0.3 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          locales.map((locale) => [locale, `${siteUrl}/${locale}${path}`]),
        ),
      },
    };
  });
}
