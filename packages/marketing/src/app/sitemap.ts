import type { MetadataRoute } from "next";
import { locales, defaultLocale } from "@/i18n/config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

const pages = ["", "/families", "/hen-parties", "/team-building"];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((page) => ({
    url: `${siteUrl}/${defaultLocale}${page}`,
    lastModified: "2026-04-04",
    changeFrequency: "weekly" as const,
    priority: page === "" ? 1 : 0.8,
    alternates: {
      languages: Object.fromEntries(
        locales.map((locale) => [locale, `${siteUrl}/${locale}${page}`]),
      ),
    },
  }));
}
