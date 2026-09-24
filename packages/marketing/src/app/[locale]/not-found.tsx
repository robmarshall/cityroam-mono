"use client";

// A client component on purpose: it reads messages from the layout's
// NextIntlClientProvider. As a server component, next-intl had to fall back
// to request headers here, which broke the server render and left an empty
// HTML shell. Next adds its own noindex tag to 404 responses.
import { useTranslations } from "next-intl";
import { Annotation } from "@/components/Annotation";
import { LineMap } from "@/components/LineMap";
import { Link } from "@/i18n/navigation";

const AUDIENCE_LINKS = [
  { href: "/families", labelKey: "header.families" },
  { href: "/hen-parties", labelKey: "header.henParties" },
  { href: "/team-building", labelKey: "header.teamBuilding" },
  { href: "/stag-parties", labelKey: "header.stagParties" },
] as const;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)";

export default function NotFound() {
  const t = useTranslations("notFound");
  const tc = useTranslations("common");

  return (
    <main className="relative isolate overflow-hidden bg-stone-50 px-6 py-20 sm:py-28">
      {/* A faint crop of the route sketch round the edges (somewhere in the
          city, not here), faded out behind the text. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-50"
        style={{
          maskImage: "radial-gradient(ellipse at center, transparent 35%, black 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, transparent 35%, black 80%)",
        }}
      >
        <LineMap variant="backdrop" crop="east" />
      </div>
      <div className="mx-auto max-w-xl text-center">
        <p className="font-display text-7xl font-semibold tracking-tight text-ink-900 sm:text-8xl">404</p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance text-ink-900 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{t("description")}</p>
        <Annotation text={t("note")} tail="top-left" className="mx-auto mt-8" />
        <Link
          href="/"
          className={`mt-10 inline-flex rounded-button bg-brick-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-brick-600 ${FOCUS}`}
        >
          {t("backHome")}
        </Link>
        <nav aria-labelledby="not-found-elsewhere" className="mt-10">
          <h2 id="not-found-elsewhere" className="text-sm font-semibold text-muted">
            {t("elsewhere")}
          </h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {AUDIENCE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`rounded-sm font-medium text-brick-600 underline underline-offset-4 hover:text-ink-900 ${FOCUS}`}
                >
                  {tc(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
