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
import { CONTACT_EMAIL } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "teamBuilding");
}

export default async function TeamBuilding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("teamBuilding");
  const tc = await getTranslations("cta");
  const tf = await getTranslations("facts");
  const facts = factValues(tf);

  return (
    <main className="min-h-screen">
      <PageHero title={t("hero.title")} subtitle={t("hero.subtitle")}>
        <CTAButton location="team-hero" segment="team-building" />
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
        <SectionHeading title={t("whyChoose.title")} />
        <CardGrid>
          {(["collaboration", "perspective", "inclusive", "energised"] as const).map((key) => (
            <Card
              key={key}
              title={t(`whyChoose.${key}.title`)}
              description={t(`whyChoose.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section tone="white">
        <SectionHeading title={t("perfectFor.title")} subtitle={t("perfectFor.subtitle")} />
        <CardGrid columns={3}>
          {(["newTeam", "crossDept", "morale"] as const).map((key) => (
            <Card
              key={key}
              title={t(`perfectFor.${key}.title`)}
              description={t(`perfectFor.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section>
        <SectionHeading title={t("sizes.title")} />
        <CardGrid columns={3}>
          {(["sweetSpot", "multiple", "competition"] as const).map((key) => (
            <Card
              key={key}
              title={t(`sizes.${key}.title`)}
              description={t(`sizes.${key}.description`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section tone="white">
        <SectionHeading title={t("benefits.title")} />
        <CheckList items={Array.from({ length: 6 }, (_, i) => t(`benefits.items.${i}`))} />
      </Section>

      <Section width="narrow">
        <SectionHeading align="left" title={t("practical.title")} />
        <div className="mt-8 space-y-6 text-lg leading-relaxed text-ink-700">
          <p>{t("practical.text1")}</p>
          <p>{t("practical.text2", facts)}</p>
          <p>{t("practical.text3")}</p>
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading title={t("faq.title")} />
        <FAQ namespace="teamBuilding.faq" count={4} />
      </Section>

      <CtaBand
        text={t("cta.text")}
        note={tc("priceNote", facts)}
        subnote={tf("perHead", facts)}
      >
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:items-start">
          <CTAButton location="team-cta" segment="team-building" variant="inverse" />
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="rounded-button border-2 border-white px-8 py-[calc(1rem-2px)] text-lg font-semibold text-white transition-colors hover:bg-white hover:text-brick-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("cta.contactLabel")}
          </a>
        </div>
      </CtaBand>

      <StickyBookBar location="team-building-sticky-bar" segment="team-building" />
    </main>
  );
}
