/*
  <!-- TEMPLATE — review with a solicitor before launch. -->

  The wording below is a good-faith draft describing the data this codebase
  actually handles (buyer email, Stripe payment references, participant display
  names, in-game chat, gameplay progress, PostHog analytics, Resend email,
  DeepSeek for the AI guide). It is not legal advice and it has not been
  reviewed by a qualified adviser. The controller identity bullet still contains
  a placeholder, and the retention periods stated here are a policy commitment
  that is not yet enforced by any automated deletion job.
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
  return buildMetadata(locale, "privacy");
}

export default async function Privacy({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("legal");

  return (
    <LegalPage
      title={t("privacy.title")}
      intro={t("privacy.intro")}
      lastUpdated={t("lastUpdated")}
      backHome={t("backHome")}
      sections={t.raw("privacy.sections") as LegalSection[]}
    />
  );
}
