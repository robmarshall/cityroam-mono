import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PRIVATE_ROBOTS } from "@/components/gift/metadata";

/**
 * The gift result reads `session_id` from the query string and polls the API,
 * so it is rendered on demand, and it shows a voucher code, so it is kept
 * out of search results.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gift.meta" });
  return { title: t("successTitle"), robots: PRIVATE_ROBOTS };
}

export default function GiftSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
