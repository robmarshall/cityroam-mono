import { getTranslations, setRequestLocale } from "next-intl/server";
import { RedeemFlow } from "@/components/gift/RedeemFlow";
import { OwlMark } from "@/components/OwlMark";

/**
 * Redeems a gift code. The code may arrive in any case, with or without
 * dashes, or not at all (typed by hand from the card).
 */
export default async function RedeemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gift.redeem");
  const { code } = await searchParams;
  const initialCode = (Array.isArray(code) ? code[0] : code)?.slice(0, 40) ?? "";

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto w-full max-w-xl">
        <OwlMark size={36} className="text-ink-900" />
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-balance text-ink-900 sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{t("subtitle")}</p>
        <div className="mt-10">
          <RedeemFlow initialCode={initialCode} />
        </div>
      </div>
    </main>
  );
}
