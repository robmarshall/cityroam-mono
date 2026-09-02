/*
  <!-- TEMPLATE — review with a solicitor before launch. -->

  The wording below is a good-faith draft written for a UK-based, consumer-facing
  self-guided treasure hunt sold through Stripe. It is not legal advice and it
  has not been reviewed by a qualified adviser. The trader identity bullet still
  contains a placeholder that must be completed before this page goes live.
*/

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "terms");
}

export default async function Terms({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("legal");

  return (
    <LegalPage
      title={t("terms.title")}
      intro={t("terms.intro")}
      lastUpdated={t("lastUpdated")}
      backHome={t("backHome")}
      sections={t.raw("terms.sections") as LegalSection[]}
    />
  );
}
