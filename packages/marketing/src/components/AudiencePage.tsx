import { getTranslations } from "next-intl/server";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { Annotation } from "@/components/Annotation";
import { CTAButton, type CheckoutSegment } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";
import { KeyFacts, PerHead } from "@/components/KeyFacts";
import { LineMap } from "@/components/LineMap";
import { PhotoHero } from "@/components/PhotoHero";
import { PhotoPlaceholder, PhotoSlot } from "@/components/PhotoSlot";
import { RouteAtAGlance } from "@/components/RouteAtAGlance";
import { CtaBand, Section, SectionHeading } from "@/components/Section";
import { StickyBookBar } from "@/components/StickyBookBar";
import { TrustStrip } from "@/components/TrustStrip";
import { Link } from "@/i18n/navigation";
import { factValues } from "@/lib/facts";
import type { PhotoSlotName } from "@/lib/photos";
import { LEEDS_ROUTE_FACTS } from "@/lib/route-facts";
import { CONTACT_EMAIL, MAX_PARTICIPANTS } from "@/lib/site";

export type AudienceKey = "families" | "henParties" | "teamBuilding" | "stagParties";

/**
 * Everything that differs between the audience pages apart from the copy,
 * which lives under the same message namespace as the key (`families.*`,
 * `stagParties.*`, …) with a shared shape: hero, notes, proof.0–2,
 * twoGroups.text, faq, cta.
 */
const AUDIENCES: Record<
  AudienceKey,
  {
    segment: CheckoutSegment;
    /** Prefix for the CTA `location`s sent to analytics. */
    location: string;
    hero: PhotoSlotName;
    /** The photo beside the three reasons. Null keeps the guidebook panel. */
    detail: PhotoSlotName | null;
    faqCount: number;
    /** Team pages offer an email link for invoices and several teams. */
    contact?: boolean;
  }
> = {
  families: { segment: "families", location: "families", hero: "families", detail: "familiesDetail", faqCount: 7 },
  henParties: { segment: "hen-parties", location: "hen", hero: "henParties", detail: "henPartiesDetail", faqCount: 6 },
  teamBuilding: {
    segment: "team-building",
    location: "team",
    hero: "teamBuilding",
    detail: "teamBuildingDetail",
    faqCount: 6,
    contact: true,
  },
  // No detail photo: the shot list's S2 is a pint stop, and the page
  // doesn't sell the drinking.
  stagParties: { segment: "stag", location: "stag", hero: "stagParties", detail: null, faqCount: 6 },
};

/**
 * The audience pages (Phase 4 of docs/plans/brand-direction-a.md), in order:
 * a photo hero with the price in it, three reasons that are true for this
 * audience, "two groups? book two games", the route at a glance, why it's
 * safe to book, questions, and a navy closing band with the page's checkout
 * segment.
 *
 * The mobile booking bar keeps the segment too, and hides while the hero
 * button or the closing band is on screen.
 */
export async function AudiencePage({
  audience,
  locale,
}: {
  audience: AudienceKey;
  locale: SupportedLanguage;
}) {
  const config = AUDIENCES[audience];
  const t = await getTranslations(audience);
  const ta = await getTranslations("audience");
  const tr = await getTranslations("home.route");
  const tc = await getTranslations("cta");
  const tf = await getTranslations("facts");
  const facts = factValues(tf);

  return (
    <main className="min-h-screen">
      <PhotoHero
        slot={config.hero}
        locale={locale}
        notes={<Annotation text={t("notes.hero")} at={{ x: 7, y: 9 }} tail="bottom-left" />}
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
              <p className={`mt-6 text-lg leading-8 sm:text-xl ${onPhoto ? "text-stone-100" : "text-ink-700"}`}>
                {t("hero.subtitle", facts)}
              </p>
              {/* The price, in the hero rather than only in the closing band. */}
              <div className="mt-8">
                <p
                  className={`font-display text-2xl sm:text-3xl ${onPhoto ? "text-stone-100" : "text-ink-700"}`}
                >
                  {ta.rich("heroPrice", {
                    ...facts,
                    b: (chunks) => (
                      <strong
                        className={`text-4xl font-semibold tracking-tight sm:text-5xl ${
                          onPhoto ? "text-stone-50" : "text-ink-900"
                        }`}
                      >
                        {chunks}
                      </strong>
                    ),
                  })}
                </p>
                <PerHead className={`mt-1 text-base text-balance ${onPhoto ? "text-stone-100" : "text-muted"}`} />
              </div>
              <div className="mt-8">
                <CTAButton
                  location={`${config.location}-hero`}
                  segment={config.segment}
                  align={onPhoto ? "start" : "start-lg"}
                  variant={onPhoto ? "inverse" : "primary"}
                />
              </div>
              <KeyFacts hidePrice align={onPhoto ? "start" : "start-lg"} tone={onPhoto ? "dark" : "light"} />
            </>
          );
        }}
      </PhotoHero>

      {/* Three reasons, beside a photo (or the guidebook panel). */}
      <Section tone="white">
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-16">
          <div>
            <SectionHeading align="left" title={t("proof.title")} />
            <ol className="mt-10 space-y-8">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-brick-500 font-display text-lg font-semibold text-brick-600"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink-900">
                      {t(`proof.${i}.title`, facts)}
                    </h3>
                    <p className="mt-1 leading-relaxed text-muted">{t(`proof.${i}.text`, facts)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {/* Room below for the Owl's note to hang off the corner. */}
          <div className="relative md:pb-16">
            {config.detail ? (
              <PhotoSlot
                slot={config.detail}
                locale={locale}
                crop="south"
                sizes="(min-width: 48rem) 22rem, 100vw"
                className="aspect-[16/9] rounded-card md:aspect-[4/5]"
              />
            ) : (
              <PhotoPlaceholder crop="east" className="aspect-[16/9] rounded-card md:aspect-[4/5]" />
            )}
            <Annotation
              text={t("notes.proof")}
              at={{ x: -8, y: 78 }}
              tail="top-left"
              delay={400}
              className="mt-4"
            />
          </div>
        </div>
      </Section>

      {/* Two groups? Book two games. */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <SectionHeading align="left" title={ta("twoGroups.title")} subtitle={t("twoGroups.text", facts)} />
            <ul className="mt-8 space-y-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3 text-lg leading-relaxed text-ink-700">
                  <span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rotate-45 bg-brick-500" />
                  <span>{ta(`twoGroups.points.${i}`, facts)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-base text-muted">{ta("twoGroups.note")}</p>
            {/* The one link from each audience page to the treasure-hunt page. */}
            <p className="mt-4 text-base">
              <Link
                href="/treasure-hunt"
                className="font-medium text-brick-600 underline underline-offset-2 hover:text-ink-900"
              >
                {ta("treasureLink")}
                <span aria-hidden="true"> →</span>
              </Link>
            </p>
          </div>
          <TwoTickets
            game={(n) => ta("twoGroups.ticket", { n })}
            players={ta("twoGroups.ticketPlayers", facts)}
            price={facts.price}
          />
        </div>
      </Section>

      {/* The route, compact: facts beside a small sketch. */}
      <Section tone="white">
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:gap-16">
          <div>
            <SectionHeading align="left" title={ta("route.title")} subtitle={ta("route.subtitle")} />
            <div className="mt-8">
              <RouteAtAGlance facts={LEEDS_ROUTE_FACTS} />
            </div>
            <p className="mt-4 text-sm text-muted">{tr("note")}</p>
          </div>
          <div className="hidden aspect-[4/3] rounded-card bg-stone-50 p-3 ring-1 ring-stone-200 md:block">
            <LineMap label={tr("mapLabel", facts)} startLabel={tr("start")} />
          </div>
        </div>
      </Section>

      <Section>
        <TrustStrip />
      </Section>

      <Section tone="white">
        <SectionHeading title={t("faq.title")} />
        <FAQ namespace={`${audience}.faq`} count={config.faqCount} values={facts} />
      </Section>

      <CtaBand text={t("cta.text")} note={tc("priceNote", facts)} subnote={tf("perHead", facts)}>
        {config.contact ? (
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:items-start">
            <CTAButton location={`${config.location}-cta`} segment={config.segment} variant="inverse" />
            {/* Stone outline on navy: never brick here (2.93:1). */}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded-button px-8 py-4 text-lg font-semibold text-stone-50 ring-2 ring-inset ring-stone-50 transition-colors hover:bg-stone-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none"
            >
              {t("cta.contactLabel")}
            </a>
          </div>
        ) : (
          <CTAButton location={`${config.location}-cta`} segment={config.segment} variant="inverse" />
        )}
      </CtaBand>

      <StickyBookBar location={`${config.location}-sticky-bar`} segment={config.segment} />
    </main>
  );
}

/**
 * Two booking stubs side by side: the picture of "two games, each up to 10".
 * Decorative; the list beside it says the same in words.
 */
function TwoTickets({
  game,
  players,
  price,
}: {
  game: (n: number) => string;
  players: string;
  price: string;
}) {
  return (
    <div aria-hidden="true" className="relative mx-auto flex w-full max-w-sm items-center justify-center gap-3 sm:gap-4">
      {[1, 2].map((n) => (
        <div
          key={n}
          className={`relative flex-1 rounded-card bg-white px-4 py-6 text-center shadow-[0_8px_24px_-12px_rgba(20,33,61,0.3)] ring-1 ring-stone-200 sm:px-5 ${
            n === 1 ? "-rotate-3" : "translate-y-4 rotate-2"
          }`}
        >
          {/* The perforation between the stub and the ticket. */}
          <div className="absolute inset-x-4 top-12 border-t-2 border-dashed border-stone-200" />
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{game(n)}</p>
          <p className="mt-8 font-display text-3xl font-semibold text-ink-900">{price}</p>
          <p className="mt-2 text-sm leading-snug text-ink-700">{players}</p>
          <div className="mt-4 flex justify-center gap-1">
            {Array.from({ length: MAX_PARTICIPANTS }, (_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-brick-500" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
