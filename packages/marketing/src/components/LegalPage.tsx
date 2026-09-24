import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type LegalSection = {
  heading: string;
  body?: string[];
  bullets?: string[];
  after?: string[];
};

/** Pages with at least this many sections get a table of contents. */
const TOC_MIN_SECTIONS = 5;

/**
 * Terms, privacy and refunds. Styling only: the wording comes from
 * `legal.*` in messages/*.json and is rendered as given (solicitor review
 * pending), so never rewrite or reorder it here.
 *
 * Long pages get a numbered table of contents: a box above the text on
 * phones and a sticky column beside it from lg. The text itself stays at
 * about 65 characters a line.
 */
export function LegalPage({
  title,
  intro,
  lastUpdated,
  backHome,
  sections,
}: {
  title: string;
  intro: string;
  lastUpdated: string;
  backHome: string;
  sections: LegalSection[];
}) {
  const t = useTranslations("common.legalNav");
  const withToc = sections.length >= TOC_MIN_SECTIONS;

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-16 sm:py-24">
      <div
        className={`mx-auto ${
          withToc ? "max-w-5xl lg:grid lg:grid-cols-[14rem_minmax(0,65ch)] lg:justify-between lg:gap-16" : "max-w-[65ch]"
        }`}
      >
        <header className={withToc ? "lg:col-span-2" : undefined}>
          <h1 className="max-w-[20ch] font-display text-4xl font-semibold tracking-tight text-balance text-ink-900 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted">{lastUpdated}</p>
          <div aria-hidden="true" className="mt-6 h-1 w-16 bg-brick-500" />
        </header>

        {withToc && (
          <nav
            aria-labelledby="legal-contents"
            className="mt-10 rounded-card bg-white p-5 ring-1 ring-stone-200 lg:sticky lg:top-8 lg:mt-12 lg:self-start lg:bg-transparent lg:p-0 lg:ring-0"
          >
            <h2 id="legal-contents" className="text-sm font-semibold tracking-wide text-muted uppercase">
              {t("contents")}
            </h2>
            <ol className="mt-4 space-y-2.5 text-sm">
              {sections.map((section, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden="true" className="w-5 shrink-0 text-right font-display text-muted tabular-nums">
                    {i + 1}
                  </span>
                  <a
                    href={`#legal-section-${i}`}
                    className="leading-snug text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline hover:decoration-brick-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className={withToc ? "lg:mt-12" : undefined}>
          <p className="mt-10 text-lg leading-relaxed text-ink-700 lg:mt-0">{intro}</p>

          <div className="mt-12 space-y-12">
            {sections.map((section, i) => (
              <section
                key={i}
                aria-labelledby={`legal-section-${i}`}
                className="scroll-mt-8 border-t border-stone-200 pt-10 first:border-t-0 first:pt-0"
              >
                <h2
                  id={`legal-section-${i}`}
                  className="scroll-mt-8 font-display text-2xl font-semibold tracking-tight text-balance text-ink-900"
                >
                  {section.heading}
                </h2>

                {section.body?.map((paragraph, j) => (
                  <p key={j} className="mt-4 leading-relaxed text-ink-700">
                    {paragraph}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="mt-4 list-disc space-y-2 pl-6 text-ink-700 marker:text-brick-500">
                    {section.bullets.map((bullet, j) => (
                      <li key={j} className="pl-1 leading-relaxed">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}

                {section.after?.map((paragraph, j) => (
                  <p key={j} className="mt-4 leading-relaxed text-ink-700">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <div className="mt-16 border-t border-stone-200 pt-8">
            <Link
              href="/"
              className="text-sm font-medium text-brick-600 underline underline-offset-2 transition-colors hover:text-ink-900"
            >
              {backHome}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
