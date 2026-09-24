"use client";

// A client component on purpose: it reads messages from the layout's
// NextIntlClientProvider. As a server component, next-intl had to fall back
// to request headers here, which broke the server render and left an empty
// HTML shell. Next adds its own noindex tag to 404 responses.
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-24">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm font-semibold text-brick-600">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">{t("description")}</p>
        <Link
          href="/"
          className="mt-10 inline-flex rounded-button bg-brick-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-brick-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
