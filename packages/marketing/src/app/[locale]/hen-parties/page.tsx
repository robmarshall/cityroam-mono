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
} from "@/components/Section";
import { factValues } from "@/lib/facts";
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
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("henParties");
  const tc = await getTranslations("cta");
  const tf = await getTranslations("facts");
  const facts = factValues(tf);

  return (
    <main className="min-h-screen bg-white">
      <PageHero title={t("hero.title")} subtitle={t("hero.subtitle")}>
        <CTAButton location="hen-hero" segment="hen-parties" />
        <KeyFacts />
      </PageHero>

      <Intro>
        <p>
          {t.rich("problem.text1", {
            b: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
          })}
        </p>
        <p>{t("problem.text2")}</p>
        <p>{t("problem.text3")}</p>
      </Intro>

      <Section>
        <SectionHeading title={t("whyLove.title")} />
        <CardGrid>
          {(["different", "group", "instagram", "timing"] as const).map((key) => (
            <Card
              key={key}
              title={t(`whyLove.${key}.title`)}
              description={t(`whyLove.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section tone="muted">
        <SectionHeading title={t("styles.title")} subtitle={t("styles.subtitle")} />
        <CardGrid columns={3}>
          {(["daytime", "alternative", "mixed"] as const).map((key) => (
            <Card
              key={key}
              title={t(`styles.${key}.title`)}
              description={t(`styles.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section>
        <SectionHeading title={t("organise.title")} />
        <CardGrid columns={3}>
          {(["perfectSize", "simple", "special"] as const).map((key) => (
            <Card
              key={key}
              title={t(`organise.${key}.title`)}
              description={t(`organise.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section tone="muted">
        <SectionHeading title={t("special.title")} />
        <CheckList items={Array.from({ length: 6 }, (_, i) => t(`special.items.${i}`))} />
      </Section>

      <Section width="narrow">
        <SectionHeading align="left" title={t("safety.title")} />
        <div className="mt-8 space-y-6 text-lg leading-relaxed text-gray-700">
          <p>{t("safety.text1")}</p>
          <p>{t("safety.text2")}</p>
          <p>{t("safety.text3")}</p>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading title={t("faq.title")} />
        <FAQ namespace="henParties.faq" count={6} />
      </Section>

      <CtaBand
        text={t("cta.text")}
        note={tc("priceNote", facts)}
        subnote={tf("perHead", facts)}
      >
        <CTAButton location="hen-cta" segment="hen-parties" variant="inverse" />
      </CtaBand>

      <StickyBookBar location="hen-parties-sticky-bar" segment="hen-parties" />
    </main>
  );
}
