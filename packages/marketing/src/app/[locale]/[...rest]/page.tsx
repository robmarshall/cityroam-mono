import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

/**
 * Any path under a locale that matches no page lands here, so it renders the
 * localised `[locale]/not-found.tsx` inside the site layout instead of Next's
 * unbranded default 404.
 *
 * setRequestLocale must run first: without it next-intl falls back to reading
 * request headers, which fails the server render and leaves an empty HTML
 * shell that only fills in once the client JavaScript runs.
 */
export default async function CatchAll({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  notFound();
}
