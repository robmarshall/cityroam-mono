import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VOUCHER_EXPIRY_MONTHS } from "@cityroam/shared/constants";
import { Annotation } from "@/components/Annotation";
import { FAQ } from "@/components/FAQ";
import { PhotoPlaceholder } from "@/components/PhotoSlot";
import { CheckList, Section, SectionHeading, Steps } from "@/components/Section";
import { GiftForm } from "@/components/gift/GiftForm";
import { giftPageMetadata } from "@/components/gift/metadata";
import { linkClass } from "@/components/gift/styles";
import { Link } from "@/i18n/navigation";
import { factValues } from "@/lib/facts";

const GIFT_FAQ_COUNT = 4;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return giftPageMetadata(locale);
}

/**
 * "Give a game": what the recipient gets, the purchase form (Stripe
 * Checkout for a voucher, docs/vouchers.md) and a few questions. Stripe
 * sends the buyer back to /gift/success, or here if they cancel.
 */
export default async function Gift({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("gift.page");
  const tf = await getTranslations("facts");
  const values = { ...factValues(tf), months: VOUCHER_EXPIRY_MONTHS };
  const link = (chunks: React.ReactNode) => (
    <Link href="/redeem" className={linkClass}>
      {chunks}
    </Link>
  );

  return (
    <main className="min-h-screen">
      <Section className="pt-16 sm:pt-20">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-center md:gap-16">
          <div>
            <p className="text-sm font-semibold tracking-wide text-brick-600 uppercase">{t("eyebrow")}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance text-ink-900 sm:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-6 text-lg leading-8 text-ink-700 sm:text-xl">{t("subtitle")}</p>
            <p className="mt-6 text-base text-ink-700">{t.rich("redeemPrompt", { link })}</p>
          </div>
          <div className="relative">
            <PhotoPlaceholder crop="east" className="aspect-[16/9] rounded-card md:aspect-[4/5]" />
            <Annotation
              text={t("note")}
              at={{ x: -12, y: 10 }}
              tail="bottom-right"
              className="-mt-8 ml-4"
            />
          </div>
        </div>
      </Section>

      <Section id="buy" tone="white" className="scroll-mt-4">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:items-start md:gap-16">
          <div>
            <SectionHeading align="left" title={t("getTitle")} />
            <CheckList
              items={Array.from({ length: 5 }, (_, i) => t(`get.${i}`, values))}
              columns={1}
              className="mt-8"
            />
          </div>
          <GiftForm />
        </div>
      </Section>

      <Section>
        <SectionHeading title={t("how.title")} />
        <Steps
          layout="list"
          steps={[1, 2, 3].map((n) => ({
            title: t(`how.step${n}Title`),
            description: t(`how.step${n}Desc`, values),
          }))}
        />
      </Section>

      <Section tone="white">
        <SectionHeading title={t("faqTitle")} />
        <FAQ namespace="gift.page.faq" count={GIFT_FAQ_COUNT} values={values} />
        <p className="mx-auto mt-8 max-w-2xl text-muted">
          {t.rich("refunds", {
            link: (chunks) => (
              <Link href="/refunds" className={linkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Section>
    </main>
  );
}
