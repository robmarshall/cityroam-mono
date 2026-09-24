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
import { KeyFacts, PerHead } from "@/components/KeyFacts";
import { LineMap } from "@/components/LineMap";
import { PhotoHero } from "@/components/PhotoHero";
import { RouteAtAGlance } from "@/components/RouteAtAGlance";
import { CheckList, CtaBand, Section, SectionHeading, Steps } from "@/components/Section";
import { StickyBookBar } from "@/components/StickyBookBar";
import { TrustStrip } from "@/components/TrustStrip";
import { factValues } from "@/lib/facts";
import { buildMetadata } from "@/lib/metadata";
import { LEEDS_ROUTE_FACTS } from "@/lib/route-facts";

const HOME_FAQ_COUNT = 11;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "home");
}

/**
 * The home page, in the order of docs/plans/brand-direction-a.md (Phase 3):
 * hero, how it works, the route, what you get and the price, the comparison,
 * who it's for, why it's safe to book, questions, and a closing band.
 *
 * The mobile booking bar appears once the hero button has scrolled away and
 * hides while the price section or the closing band is on screen (both are
 * `bookZone`s), so two "Book" buttons are never in view together.
 */
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = (await params) as { locale: SupportedLanguage };
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const tc = await getTranslations("cta");
  const tf = await getTranslations("facts");
  const facts = factValues(tf);
  const list = (key: string, count: number) =>
    Array.from({ length: count }, (_, i) => t(`${key}.${i}`, facts));

  return (
    <main className="min-h-screen">
      {/* Hero: the photo (or its placeholder), two of the Owl's notes, the
          promise, the button and the four key facts. */}
      <PhotoHero
        slot="homeHero"
        locale={locale}
        notes={
          <>
            <Annotation text={t("notes.roof")} at={{ x: 7, y: 9 }} tail="bottom-left" />
            <Annotation
              text={t("notes.briggate")}
              at={{ x: 6, y: 58, fromRight: true }}
              tail="top-right"
              delay={500}
              hideBelowMd
            />
          </>
        }
      >
        {(ground) => {
          const onPhoto = ground === "photo";
          return (
            <>
              <h1
                className={`font-display text-4xl font-semibold tracking-tight text-balance sm:text-6xl ${
                  onPhoto ? "text-stone-50" : "text-ink-900"
                }`}
              >
                {t("hero.title")}
              </h1>
              <p
                className={`mt-6 text-lg leading-8 sm:text-xl ${onPhoto ? "text-stone-100" : "text-ink-700"}`}
              >
                {t("hero.subtitle")}
              </p>
              <div className="mt-10">
                <CTAButton
                  location="hero"
                  align={onPhoto ? "start" : "start-lg"}
                  variant={onPhoto ? "inverse" : "primary"}
                />
              </div>
              <KeyFacts align={onPhoto ? "start" : "start-lg"} tone={onPhoto ? "dark" : "light"} />
            </>
          );
        }}
      </PhotoHero>

      {/* How it works, beside the chat itself. */}
      <Section tone="white">
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div>
            <SectionHeading align="left" title={t("howItWorks.title")} />
            <Steps
              layout="list"
              steps={[1, 2, 3, 4].map((n) => ({
                title: t(`howItWorks.step${n}Title`),
                description: t(`howItWorks.step${n}Desc`),
              }))}
            />
          </div>
          {/* The 700px mock is too tall for phones; they get a few lines of
              the same conversation. */}
          <div className="relative mx-auto hidden shrink-0 rotate-2 sm:block">
            <IphoneDemo variant="hero" />
          </div>
          <ChatSnippet className="sm:hidden" />
        </div>
      </Section>

      {/* The route at a glance: facts on the left, the sketch map on the right. */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <SectionHeading align="left" title={t("route.title")} subtitle={t("route.subtitle")} />
            <div className="mt-8">
              <RouteAtAGlance facts={LEEDS_ROUTE_FACTS} />
            </div>
            <p className="mt-4 text-sm text-muted">{t("route.note")}</p>
          </div>
          {/* Room above and below the map for the Owl's notes to hang over its corners. */}
          <div className="relative md:py-20">
            <div className="aspect-[4/3] rounded-card bg-white p-3 ring-1 ring-stone-200 sm:p-5">
              <LineMap label={t("route.mapLabel", facts)} startLabel={t("route.start")} />
            </div>
            <Annotation
              text={t("notes.clock")}
              at={{ x: -3, y: 0, fromRight: true }}
              tail="bottom-right"
              delay={1200}
              className="mt-6 ml-auto"
            />
            <Annotation
              text={t("notes.carving")}
              at={{ x: -5, y: 76 }}
              tail="top-left"
              delay={1600}
              className="mt-4"
            />
          </div>
        </div>
      </Section>

      {/* What you get and the price. The whole band is a booking zone. */}
      <Section id="pricing" tone="white" bookZone className="scroll-mt-4">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-start md:gap-16">
          <div>
            <SectionHeading align="left" title={t("included.title")} subtitle={t("included.subtitle")} />
            <CheckList items={list("included.items", 6)} columns={1} className="mt-8" />
          </div>
          <div>
            <div className="rounded-card bg-stone-50 px-6 py-8 text-center ring-1 ring-stone-200 sm:px-8">
              <h3 className="font-display text-2xl font-semibold text-ink-900">{t("pricing.title")}</h3>
              <p className="mt-2 text-muted">{t("pricing.subtitle")}</p>
              <p className="mt-6 font-display text-5xl font-semibold tracking-tight text-ink-900">
                {t("pricing.price")}
                <span className="ml-2 font-sans text-lg font-medium tracking-normal text-muted">
                  {t("pricing.perGroup")}
                </span>
              </p>
              <PerHead className="mt-2 text-base text-ink-700" />
              <p className="mt-2 text-sm font-medium text-brick-600">{t("pricing.badge")}</p>
              <div className="mt-8">
                <CTAButton location="pricing" />
              </div>
              <p className="mt-6 text-sm text-muted">{t("pricing.note")}</p>
            </div>
            <GiftLine className="mt-6" />
          </div>
        </div>
      </Section>

      {/* How it compares */}
      <Section>
        <SectionHeading title={t("compare.title")} subtitle={t("compare.subtitle")} />
        <ComparisonTable />
      </Section>

      {/* Who it's for */}
      <Section tone="white">
        <SectionHeading title={t("audiences.title")} subtitle={t("audiences.subtitle")} />
        <AudienceCards locale={locale} />
      </Section>

      {/* Why it's safe to book */}
      <Section>
        <TrustStrip note={<Annotation text={t("notes.owls")} tail="top-left" />} />
      </Section>

      {/* FAQ */}
      <Section tone="white">
        <SectionHeading title={t("faqTitle")} />
        <FAQ namespace="faq" count={HOME_FAQ_COUNT} values={facts} />
      </Section>

      <CtaBand text={t("closing")} note={tc("priceNote", facts)} subnote={tf("perHead", facts)}>
        <CTAButton location="closing" variant="inverse" />
      </CtaBand>

      <StickyBookBar location="sticky-bar" />
    </main>
  );
}
