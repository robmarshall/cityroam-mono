import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import "../globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Header } from "@/components/Header";
import { locales } from "@/i18n/config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

export const metadata: Metadata = {
  title: "City Roam — AI-Guided Treasure Hunts in Leeds",
  description:
    "Explore Leeds with an AI-powered treasure hunt. Solve clues, discover hidden gems, and have fun with friends — all guided by AI on your phone.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "City Roam — AI-Guided Treasure Hunts in Leeds",
    description:
      "Explore Leeds with an AI-powered treasure hunt. Solve clues, discover hidden gems, and have fun with friends — all guided by AI on your phone.",
    url: siteUrl,
    siteName: "City Roam",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "City Roam — AI-Guided Treasure Hunts in Leeds",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "City Roam — AI-Guided Treasure Hunts in Leeds",
    description:
      "Explore Leeds with an AI-powered treasure hunt. Solve clues, discover hidden gems, and have fun with friends — all guided by AI on your phone.",
    images: ["/og-image.png"],
  },
};

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "City Roam — AI-Guided Treasure Hunt",
    description:
      "An AI-powered treasure hunt experience in Leeds city centre. Solve clues, discover hidden gems, and explore the city with friends.",
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
