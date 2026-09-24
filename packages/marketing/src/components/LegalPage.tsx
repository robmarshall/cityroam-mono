import { Link } from "@/i18n/navigation";

export type LegalSection = {
  heading: string;
  body?: string[];
  bullets?: string[];
  after?: string[];
};

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
  return (
    <main className="min-h-screen px-6 py-16 sm:py-24">
      {/* ~65 characters a line: comfortable for long legal reading. */}
      <div className="mx-auto max-w-[65ch]">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance text-ink-900 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-muted">{lastUpdated}</p>
        <div aria-hidden="true" className="mt-6 h-1 w-16 bg-brick-500" />
        <p className="mt-6 text-lg leading-relaxed text-ink-700">{intro}</p>

        <div className="mt-12 space-y-10">
          {sections.map((section, i) => (
            <section key={i} aria-labelledby={`legal-section-${i}`}>
              <h2
                id={`legal-section-${i}`}
                className="font-display text-xl font-semibold text-ink-900 sm:text-2xl"
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
                    <li key={j} className="leading-relaxed">
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

        <div className="mt-16">
          <Link
            href="/"
            className="text-sm font-medium text-brick-600 underline underline-offset-2 transition-colors hover:text-ink-900"
          >
            {backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
