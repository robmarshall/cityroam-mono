import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import "../globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Header } from "@/components/Header";
import { locales } from "@/i18n/config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  const title = t("home.title");
  const description = t("home.description");

  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      languages: Object.fromEntries([
        ["x-default", siteUrl],
        ...locales.map((l) => [l, `${siteUrl}/${l}`]),
      ]),
    },
    openGraph: {
      title,
      description,
      url: siteUrl,
      siteName: "City Roam",
      type: "website",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
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

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "metadata" });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: t("home.title"),
    description: t("home.description"),
    brand: {
      "@type": "Brand",
      name: "City Roam",
    },
    offers: {
      "@type": "Offer",
      price: "29.00",
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      url: siteUrl,
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Header />
          <PostHogProvider>{children}</PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
