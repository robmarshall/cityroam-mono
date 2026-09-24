/**
 * Small pieces shared by the gift and redemption pages. Colours follow the
 * contrast rules in docs/plans/brand-direction-a.md: these pages only use
 * stone and white grounds, so brick buttons and brick-600 links are fine.
 */

export const inputClass =
  "block w-full rounded-button border border-stone-300 bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-muted aria-invalid:border-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:bg-stone-100";

export const labelClass = "block font-medium text-ink-900";

export const hintClass = "mt-1 text-sm text-muted";

const primaryButtonBase =
  "inline-flex items-center justify-center rounded-button bg-brick-500 font-semibold text-white transition-colors hover:bg-brick-600 active:bg-brick-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-70";

export const primaryButtonClass = `${primaryButtonBase} px-8 py-4 text-lg`;

export const primaryButtonSmallClass = `${primaryButtonBase} px-6 py-3 text-base`;

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-button bg-transparent px-6 py-3 font-semibold text-ink-900 ring-2 ring-inset ring-ink-900 transition-colors hover:bg-ink-900 hover:text-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-70";

export const linkClass =
  "font-medium text-brick-600 underline underline-offset-2 hover:text-ink-900";

/** Dates on these pages are UK dates (the vouchers and games run on UK time). */
export function formatDate(locale: string, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Plain "en" formats the American way (September 24, 2027).
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(date);
}
