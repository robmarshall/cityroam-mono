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
    <main className="min-h-screen bg-white px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-gray-500">{lastUpdated}</p>
        <p className="mt-6 text-lg leading-relaxed text-gray-700">{intro}</p>

        <div className="mt-12 space-y-10">
          {sections.map((section, i) => (
            <section key={i} aria-labelledby={`legal-section-${i}`}>
              <h2
                id={`legal-section-${i}`}
                className="text-xl font-semibold text-gray-900 sm:text-2xl"
              >
                {section.heading}
              </h2>

              {section.body?.map((paragraph, j) => (
                <p key={j} className="mt-4 leading-relaxed text-gray-600">
                  {paragraph}
                </p>
              ))}

              {section.bullets && (
                <ul className="mt-4 list-disc space-y-2 pl-6 text-gray-600">
                  {section.bullets.map((bullet, j) => (
                    <li key={j} className="leading-relaxed">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}

              {section.after?.map((paragraph, j) => (
                <p key={j} className="mt-4 leading-relaxed text-gray-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-16">
          <Link
            href="/"
            className="text-sm font-medium text-gray-600 underline underline-offset-2 transition-colors hover:text-gray-900"
          >
            {backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
