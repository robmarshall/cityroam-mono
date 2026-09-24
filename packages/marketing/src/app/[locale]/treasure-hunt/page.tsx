import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { Annotation } from "@/components/Annotation";
import { AudienceCards } from "@/components/AudienceCards";
import { ComparisonTable } from "@/components/ComparisonTable";
import { CTAButton } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";
import { GiftLine } from "@/components/GiftLine";
import ChatSnippet from "@/components/IphoneDemo/ChatSnippet";
import IphoneDemo from "@/components/IphoneDemo/IphoneDemo";
import { KeyFacts } from "@/components/KeyFacts";
import { Card, CardGrid, CtaBand, PageHero, Section, SectionHeading } from "@/components/Section";
import { StickyBookBar } from "@/components/StickyBookBar";
import { factValues } from "@/lib/facts";
import { buildMetadata } from "@/lib/metadata";

const FAQ_COUNT = 6;
const SEGMENT = "treasure-hunt";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "treasureHunt");
}

/**
 * The one page that targets "treasure hunt Leeds" (see the positioning
 * review: the home page leads with exploring the city, and keeps the term
 * only in its "part walking tour, part treasure hunt" line). It has to earn
 * its place with content the home page doesn't have: how this differs from
 * a traditional hunt, a sample clue from the demo (never a real stop), the
 * four audiences, the comparison and its own questions.
 *
 * Checkout segment `treasure-hunt`: without a family of its own the API
 * gives it the default one, the same hunt as the home page.
 */
export default async function TreasureHunt({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = (await params) as { locale: SupportedLanguage };
  setRequestLocale(locale);

  const t = await getTranslations("treasureHunt");
  const th = await getTranslations("home.compare");
  const tc = await getTranslations("cta");
  const tf = await getTranslations("facts");
  const facts = factValues(tf);

  return (
    <main className="min-h-screen">
      <PageHero title={t("hero.title")} subtitle={t("hero.subtitle")}>
        <CTAButton location="treasure-hunt-hero" segment={SEGMENT} />
        <KeyFacts />
      </PageHero>

      {/* How it differs from a traditional treasure hunt. */}
      <Section tone="white">
        <SectionHeading title={t("differs.title")} />
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-ink-700 sm:text-xl">
          {t("differs.intro")}
        </p>
        <CardGrid>
          {[0, 1, 2, 3].map((i) => (
            <Card
              key={i}
              title={t(`differs.items.${i}.title`)}
              description={t(`differs.items.${i}.text`)}
              className="bg-stone-50"
            />
          ))}
        </CardGrid>
      </Section>

      {/* A sample clue, from the demo conversation rather than the route. */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div>
            <SectionHeading align="left" title={t("clue.title")} subtitle={t("clue.text")} />
            <p className="mt-6 text-base leading-relaxed text-ink-700">{t("clue.note")}</p>
            <Annotation text={t("notes.clue")} tail="top-left" delay={300} className="mt-8" />
          </div>
          <div className="relative mx-auto hidden shrink-0 rotate-2 sm:block">
            <IphoneDemo variant="hero" />
          </div>
          <ChatSnippet className="sm:hidden" />
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading title={t("audiences.title")} subtitle={t("audiences.subtitle")} />
        <AudienceCards locale={locale} />
      </Section>

      <Section>
        <SectionHeading title={t("compare.title")} subtitle={th("subtitle")} />
        <ComparisonTable />
      </Section>

      <Section tone="white">
        <SectionHeading title={t("faq.title")} />
        <FAQ namespace="treasureHunt.faq" count={FAQ_COUNT} values={facts} />
        <GiftLine className="mx-auto mt-10 max-w-2xl" />
      </Section>

      <CtaBand text={t("cta.text")} note={tc("priceNote", facts)} subnote={tf("perHead", facts)}>
        <CTAButton location="treasure-hunt-cta" segment={SEGMENT} variant="inverse" />
      </CtaBand>

      <StickyBookBar location="treasure-hunt-sticky-bar" segment={SEGMENT} />
    </main>
  );
}
