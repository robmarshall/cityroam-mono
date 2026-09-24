import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales } from "@/i18n/config";
import { factValues } from "@/lib/facts";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { VOUCHER_EXPIRY_MONTHS } from "@cityroam/shared/constants";

/**
 * Metadata for the gift pages, built like lib/metadata.ts's buildMetadata
 * but from the `gift` namespace. /gift is indexable; the success and redeem
 * pages are private (a code in the URL) and set noindex in their layouts.
 */
export async function giftPageMetadata(locale: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "gift.meta" });
  const tf = await getTranslations({ locale, namespace: "facts" });
  const tm = await getTranslations({ locale, namespace: "metadata.home" });
  const values = { ...factValues(tf), months: VOUCHER_EXPIRY_MONTHS };

  const title = t("title");
  const description = t("description", values);
  const path = "/gift";
  const canonical = `${siteUrl}/${locale}${path}`;

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
      images: [
        {
          url: `${siteUrl}/${locale}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: tm("ogImageAlt"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/${locale}/twitter-image`],
    },
  };
}

/** Kept out of search results: these pages carry a code or a session id. */
export const PRIVATE_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};
