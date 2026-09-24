import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { AudiencePage } from "@/components/AudiencePage";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "stagParties");
}

export default async function StagParties({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = (await params) as { locale: SupportedLanguage };
  setRequestLocale(locale);
  return <AudiencePage audience="stagParties" locale={locale} />;
}
