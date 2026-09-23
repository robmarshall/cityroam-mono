import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { locales } from "@/i18n/config";
import { SITE_NAME, siteUrl } from "@/lib/site";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Site-wide defaults only. Page-specific Open Graph, Twitter and canonical
 * tags are built per page by `buildMetadata` so that segment pages no longer
 * inherit the homepage's share card.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("home.title"),
    description: t("home.description"),
    metadataBase: new URL(siteUrl),
    applicationName: SITE_NAME,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "metadata" });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: t("home.title"),
    description: t("home.description"),
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    offers: {
      "@type": "Offer",
      price: "29.00",
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      url: `${siteUrl}/${locale}`,
    },
    areaServed: {
      "@type": "City",
      name: "Leeds",
      containedInPlace: {
        "@type": "Country",
        name: "United Kingdom",
      },
    },
  };

  return (
    <html lang={locale}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Header />
          <PostHogProvider>{children}</PostHogProvider>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
