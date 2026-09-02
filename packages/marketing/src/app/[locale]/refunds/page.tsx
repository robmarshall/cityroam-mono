/*
  <!-- TEMPLATE — review with a solicitor before launch. -->

  The wording below matches what the product actually does: the admin refund
  endpoint issues a full Stripe refund against the payment intent, marks the
  event REFUNDED and invalidates its sessions, so codes stop working straight
  away and partial refunds are not possible. It also matches the "full refund,
  no questions asked" promise already made in the FAQ and on the checkout
  success page. It is not legal advice and has not been reviewed by a qualified
  adviser.
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
  return buildMetadata(locale, "refunds");
}

export default async function Refunds({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("legal");

  return (
    <LegalPage
      title={t("refunds.title")}
      intro={t("refunds.intro")}
      lastUpdated={t("lastUpdated")}
      backHome={t("backHome")}
      sections={t.raw("refunds.sections") as LegalSection[]}
    />
  );
}
