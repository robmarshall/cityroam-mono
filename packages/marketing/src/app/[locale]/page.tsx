import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CTAButton } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";
import IphoneDemo from "@/components/IphoneDemo/IphoneDemo";
import {
  Card,
  CardGrid,
  CheckList,
  Section,
  SectionHeading,
  Steps,
} from "@/components/Section";
import { buildMetadata } from "@/lib/metadata";

const HOME_FAQ_COUNT = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "home");
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const list = (key: string, count: number) =>
    Array.from({ length: count }, (_, i) => t(`${key}.${i}`));

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="overflow-hidden px-6 py-16 sm:py-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-12 lg:flex-row lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl font-bold tracking-tight text-balance text-gray-900 sm:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">{t("hero.subtitle")}</p>
            <div className="mt-10">
              <CTAButton location="hero" align="start-lg" />
            </div>
          </div>
          {/* On phones the 700px-tall mock pushed everything below the fold, so
              it starts at the sm breakpoint. The demo lower down still shows. */}
          <div className="relative hidden shrink-0 rotate-3 sm:block lg:rotate-6">
            <IphoneDemo variant="hero" />
          </div>
        </div>
      </section>

      {/* Intro */}
      <Section tone="muted" width="narrow">
        <div className="space-y-6 text-lg leading-relaxed text-gray-700 sm:text-xl">
          <p>
            {t.rich("problem.text1", {
              b: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            })}
          </p>
          <p>{t("problem.text2")}</p>
          <p>{t("problem.text3")}</p>
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading title={t("howItWorks.title")} />
        <Steps
          steps={[1, 2, 3, 4].map((n) => ({
            title: t(`howItWorks.step${n}Title`),
            description: t(`howItWorks.step${n}Desc`),
          }))}
        />
      </Section>

      {/* Just your phone */}
      <Section tone="muted">
        <div className="flex flex-col items-center gap-12 md:flex-row md:gap-16">
          <div className="flex-1">
            <SectionHeading
              align="left"
              title={t("phone.title")}
              subtitle={t("phone.subtitle")}
            />
            <CheckList items={list("phone.features", 4)} className="mt-8 sm:grid-cols-1" />
          </div>
          <div className="relative shrink-0 -rotate-2 md:rotate-3">
            <IphoneDemo variant="howItWorks" />
          </div>
        </div>
      </Section>

      {/* What's included */}
      <Section>
        <SectionHeading title={t("included.title")} subtitle={t("included.subtitle")} />
        <CheckList items={list("included.items", 6)} />
      </Section>

      {/* Why City Roam */}
      <Section tone="muted">
        <SectionHeading title={t("whyChoose.title")} subtitle={t("whyChoose.subtitle")} />
        <CardGrid>
          {(["localKnowledge", "justYourPhone", "playYourWay", "builtForGroups"] as const).map(
            (key) => (
              <Card
                key={key}
                title={t(`whyChoose.${key}.title`)}
                description={t(`whyChoose.${key}.description`)}
              />
            ),
          )}
        </CardGrid>
      </Section>

      {/* Pricing */}
      <Section id="pricing" width="narrow" className="scroll-mt-4 text-center">
        <SectionHeading title={t("pricing.title")} subtitle={t("pricing.subtitle")} />
        <div className="mt-10 inline-block rounded-card bg-white px-10 py-8 ring-1 ring-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-600">
            <span className="sr-only">{t("pricing.originalPriceLabel")} </span>
            <s>{t("pricing.originalPrice")}</s>
          </p>
          <p className="mt-1 text-5xl font-bold tracking-tight text-gray-900">
            {t("pricing.price")}
            <span className="ml-2 text-lg font-medium tracking-normal text-gray-600">
              {t("pricing.perGroup")}
            </span>
          </p>
          <p className="mt-2 text-sm font-medium text-brand-700">{t("pricing.badge")}</p>
          <div className="mt-8">
            <CTAButton location="pricing" />
          </div>
          <p className="mt-6 text-sm text-gray-600">{t("pricing.note")}</p>
        </div>
      </Section>

      {/* Refund promise */}
      <section className="bg-brand-50 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-brand-800">{t("guarantee.title")}</h2>
          <p className="mt-3 text-lg text-brand-800">{t("guarantee.description")}</p>
        </div>
      </section>

      {/* FAQ */}
      <Section>
        <SectionHeading title={t("faqTitle")} />
        <FAQ namespace="faq" count={HOME_FAQ_COUNT} />
        <div className="mt-12 text-center">
          <CTAButton location="faq" />
        </div>
      </Section>
    </main>
  );
}
