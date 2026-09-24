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
  return buildMetadata(locale, "henParties");
}

export default async function HenParties({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = (await params) as { locale: SupportedLanguage };
  setRequestLocale(locale);
  return <AudiencePage audience="henParties" locale={locale} />;
}
