import { setRequestLocale } from "next-intl/server";
import { locales } from "@/i18n/config";
import { OG_CONTENT_TYPE, OG_SIZE, renderShareImage } from "@/lib/og";

export const alt = "City Roam";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function TwitterImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return renderShareImage(locale);
}
