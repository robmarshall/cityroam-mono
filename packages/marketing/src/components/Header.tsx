"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@cityroam/shared/constants";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { OwlMark } from "@/components/OwlMark";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)";

// Three audiences in the header, by design (docs/plans/brand-direction-a.md);
// the stag page is linked from the footer and the home page's audience cards.
const NAV_LINKS = [
  { href: "/families" as const, labelKey: "header.families" },
  { href: "/hen-parties" as const, labelKey: "header.henParties" },
  { href: "/team-building" as const, labelKey: "header.teamBuilding" },
];

/** Pages with their own booking band (`#book`) and checkout segment. */
const AUDIENCE_PATHS: string[] = [...NAV_LINKS.map((link) => link.href), "/stag-parties", "/treasure-hunt"];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const t = useTranslations("common");
  const locale = useLocale() as SupportedLanguage;
  const pathname = usePathname();
  const router = useRouter();

  // Escape closes whichever menu is open.
  useEffect(() => {
    if (!menuOpen && !langOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setLangOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, langOpen]);

  // On an audience page, "Book now" goes to that page's own booking band so
  // the checkout keeps its segment. Elsewhere it goes to the homepage price.
  const onAudiencePage = AUDIENCE_PATHS.includes(pathname);
  const bookHref = onAudiencePage ? `${pathname}#book` : "/#pricing";

  function switchLanguage(newLocale: SupportedLanguage) {
    setLangOpen(false);
    setMenuOpen(false);
    // Keep the query string (a voucher code on /redeem, say). Read at click
    // time rather than with useSearchParams, which would opt every static
    // page out of prerendering.
    router.replace(`${pathname}${window.location.search}`, { locale: newLocale });
  }

  return (
    <header className="border-b border-stone-200 bg-stone-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* The owl is decorative: the wordmark beside it is the link's name. */}
        <Link
          href="/"
          className={`-m-1 flex items-center gap-2 rounded-sm p-1 font-display text-xl font-semibold tracking-tight text-ink-900 ${FOCUS}`}
        >
          <OwlMark size={28} />
          <span>{t("header.brand")}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium text-ink-700 underline-offset-4 transition-colors hover:text-ink-900 hover:underline hover:decoration-brick-500 ${FOCUS}`}
            >
              {t(link.labelKey)}
            </Link>
          ))}
          <Link
            href={bookHref}
            className={`rounded-button bg-brick-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brick-600 ${FOCUS}`}
          >
            {t("header.bookNow")}
          </Link>
          <LanguageSwitcher
            locale={locale}
            langOpen={langOpen}
            setLangOpen={setLangOpen}
            switchLanguage={switchLanguage}
            ariaLabel={t("header.changeLanguage")}
          />
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className={`-mr-2 p-2 text-ink-700 sm:hidden ${FOCUS}`}
          aria-label={t("header.toggleMenu")}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-stone-200 px-6 py-4 sm:hidden">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`text-base font-medium text-ink-700 transition-colors hover:text-ink-900 ${FOCUS}`}
              >
                {t(link.labelKey)}
              </Link>
            ))}
            <Link
              href={bookHref}
              onClick={() => setMenuOpen(false)}
              className={`rounded-button bg-brick-500 px-5 py-3 text-center text-base font-semibold text-white transition-colors hover:bg-brick-600 ${FOCUS}`}
            >
              {t("header.bookNow")}
            </Link>
            <div className="border-t border-stone-200 pt-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("header.changeLanguage")}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    type="button"
                    key={lang}
                    lang={lang}
                    onClick={() => switchLanguage(lang)}
                    aria-label={LANGUAGE_NAMES[lang]}
                    aria-current={lang === locale ? "true" : undefined}
                    className={`rounded-button px-3 py-1.5 text-sm font-medium transition-colors ${FOCUS} ${
                      lang === locale
                        ? "bg-ink-900 text-stone-50"
                        : "bg-stone-100 text-ink-700 hover:bg-stone-200"
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

function LanguageSwitcher({
  locale,
  langOpen,
  setLangOpen,
  switchLanguage,
  ariaLabel,
}: {
  locale: SupportedLanguage;
  langOpen: boolean;
  setLangOpen: (open: boolean) => void;
  switchLanguage: (locale: SupportedLanguage) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="relative"
      // Close when focus leaves the switcher, but not when it moves between
      // its own options (the old timeout raced keyboard users).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLangOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setLangOpen(!langOpen)}
        className={`flex items-center gap-1 rounded-button border border-stone-300 px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900 ${FOCUS}`}
        aria-label={ariaLabel}
        aria-expanded={langOpen}
        aria-controls="language-menu"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {locale.toUpperCase()}
        <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {langOpen && (
        <div
          id="language-menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-card border border-stone-200 bg-white py-1 shadow-lg"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              type="button"
              key={lang}
              lang={lang}
              onClick={() => switchLanguage(lang)}
              aria-current={lang === locale ? "true" : undefined}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors focus-visible:bg-stone-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring) ${
                lang === locale
                  ? "bg-stone-100 font-semibold text-ink-900"
                  : "text-ink-700 hover:bg-stone-100"
              }`}
            >
              <span aria-hidden="true" className="w-6 font-medium text-muted">
                {lang.toUpperCase()}
              </span>
              <span>{LANGUAGE_NAMES[lang]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
