import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PRIVATE_ROBOTS } from "@/components/gift/metadata";

/**
 * /<locale>/redeem?code=XXXX-XXXX-XX is printed on every voucher card and
 * emailed to every buyer (docs/vouchers.md): keep this path and the `code`
 * parameter working. It carries a bearer code, so it is rendered on demand
 * and kept out of search results.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gift.meta" });
  return {
    title: t("redeemTitle"),
    description: t("redeemDescription"),
    robots: PRIVATE_ROBOTS,
    // A shared link must not leak the code to other sites.
    referrer: "no-referrer",
  };
}

export default function RedeemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
