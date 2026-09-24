import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CTAButton } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";
import { KeyFacts } from "@/components/KeyFacts";
import { StickyBookBar } from "@/components/StickyBookBar";
import {
  Card,
  CardGrid,
  CheckList,
  CtaBand,
  Intro,
  PageHero,
  Section,
  SectionHeading,
  Steps,
} from "@/components/Section";
import { factValues } from "@/lib/facts";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "families");
}

export default async function Families({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("families");
  const tc = await getTranslations("cta");
  const tf = await getTranslations("facts");
  const facts = factValues(tf);

  return (
    <main className="min-h-screen">
      <PageHero title={t("hero.title")} subtitle={t("hero.subtitle")}>
        <CTAButton location="families-hero" segment="families" />
        <KeyFacts />
      </PageHero>

      <Intro>
        <p>
          {t.rich("problem.text1", {
            b: (chunks) => <strong className="text-ink-900">{chunks}</strong>,
          })}
        </p>
        <p>{t("problem.text2")}</p>
        <p>{t("problem.text3")}</p>
      </Intro>

      <Section>
        <SectionHeading title={t("whyLove.title")} />
        <CardGrid>
          {(["engaged", "educational", "allAges", "bonding"] as const).map((key) => (
            <Card
              key={key}
              title={t(`whyLove.${key}.title`)}
              description={t(`whyLove.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section tone="white">
        <SectionHeading title={t("perfectFor.title")} subtitle={t("perfectFor.subtitle")} />
        <CardGrid columns={3}>
          {(["grandparents", "weekend", "holidays"] as const).map((key) => (
            <Card
              key={key}
              title={t(`perfectFor.${key}.title`)}
              description={t(`perfectFor.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section>
        <SectionHeading title={t("howItWorks.title")} />
        <Steps
          layout="list"
          steps={[1, 2, 3].map((n) => ({
            title: t(`howItWorks.step${n}Title`),
            description: t(`howItWorks.step${n}Desc`),
          }))}
        />
      </Section>

      <Section tone="white">
        <SectionHeading title={t("features.title")} subtitle={t("features.subtitle")} />
        <CheckList items={Array.from({ length: 6 }, (_, i) => t(`features.items.${i}`))} />
      </Section>

      <Section width="narrow">
        <SectionHeading align="left" title={t("safety.title")} />
        <div className="mt-8 space-y-6 text-lg leading-relaxed text-ink-700">
          <p>{t("safety.text1")}</p>
          <p>{t("safety.text2", facts)}</p>
          <p>{t("safety.text3")}</p>
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading title={t("faq.title")} />
        <FAQ namespace="families.faq" count={6} values={facts} />
      </Section>

      <CtaBand
        text={t("cta.text")}
        note={tc("priceNote", facts)}
        subnote={tf("perHead", facts)}
      >
        <CTAButton location="families-cta" segment="families" variant="inverse" />
      </CtaBand>

      <StickyBookBar location="families-sticky-bar" segment="families" />
    </main>
  );
}
