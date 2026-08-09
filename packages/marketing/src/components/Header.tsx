"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@cityroam/shared/constants";
import type { SupportedLanguage } from "@cityroam/shared/types";

const NAV_LINKS = [
  { href: "/families" as const, labelKey: "header.families" },
  { href: "/hen-parties" as const, labelKey: "header.henParties" },
  { href: "/team-building" as const, labelKey: "header.teamBuilding" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const t = useTranslations("common");
  const locale = useLocale() as SupportedLanguage;
  const pathname = usePathname();
  const router = useRouter();

  function switchLanguage(newLocale: SupportedLanguage) {
    setLangOpen(false);
    setMenuOpen(false);
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold text-gray-900">
          {t("header.brand")}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {t(link.labelKey)}
            </Link>
          ))}
          <Link
            href="/#pricing"
            className="rounded-button bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
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
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden p-2 text-gray-600"
          aria-label={t("header.toggleMenu")}
        >
          <svg
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
        <nav className="border-t border-gray-100 px-6 py-4 sm:hidden">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-base font-medium text-gray-600 transition-colors hover:text-gray-900"
              >
                {t(link.labelKey)}
              </Link>
            ))}
            <Link
              href="/#pricing"
              onClick={() => setMenuOpen(false)}
              className="rounded-button bg-brand-500 px-5 py-3 text-center text-base font-semibold text-white transition-colors hover:bg-brand-600"
            >
              {t("header.bookNow")}
            </Link>
            <div className="border-t border-gray-100 pt-4">
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => switchLanguage(lang)}
                    className={`rounded-button px-3 py-1.5 text-sm font-medium transition-colors ${
                      lang === locale
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
    <div className="relative">
      <button
        onClick={() => setLangOpen(!langOpen)}
        onBlur={() => setTimeout(() => setLangOpen(false), 150)}
        className="flex items-center gap-1 rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
        aria-label={ariaLabel}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {locale.toUpperCase()}
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {langOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-card border border-gray-200 bg-white py-1 shadow-lg">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => switchLanguage(lang)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                lang === locale
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="w-6 font-medium text-gray-400">{lang.toUpperCase()}</span>
              <span>{LANGUAGE_NAMES[lang]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
