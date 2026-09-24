import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { locales } from "@/i18n/config";
import { PRICE_GBP, SITE_NAME, siteUrl } from "@/lib/site";

// Fraunces for display (variable weight plus the optical size axis; WONK is
// left out so the default, non-wonky forms are used) and Inter for body text.
// Both self-hosted by next/font; globals.css maps the variables to
// font-display and font-sans.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

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
      price: PRICE_GBP.toFixed(2),
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
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <head>
        <script
          type="application/ld+json"
          // Escape "<" so a translated string can never close the script tag.
          // The JS string must be backslash-backslash-u003c: the old single-backslash
          // literal was the "<" character itself, so the replace did nothing.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
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
