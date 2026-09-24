import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { OwlMark } from "@/components/OwlMark";
import { CONTACT_EMAIL } from "@/lib/site";

const LINK =
  "text-stone-100 underline-offset-4 transition-colors hover:text-white hover:underline";

/**
 * Navy footer. Text is stone on ink-900 (12.9:1 and up); `on-dark` flips the
 * focus ring to stone. No brick here: brick on navy is 2.93:1.
 */
export function Footer() {
  const t = useTranslations("common");
  const tl = useTranslations("legal.footer");

  return (
    <footer className="on-dark bg-ink-900 px-6 py-12 text-stone-200">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center text-sm sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div>
          <p className="flex items-center justify-center gap-2 font-display text-lg font-semibold text-stone-50 sm:justify-start">
            <OwlMark size={24} />
            <span>{t("header.brand")}</span>
          </p>
          <p className="mt-3">
            <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:items-end">
          <nav
            aria-label={tl("navLabel")}
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          >
            <Link href="/terms" className={LINK}>
              {tl("terms")}
            </Link>
            <Link href="/privacy" className={LINK}>
              {tl("privacy")}
            </Link>
            <Link href="/refunds" className={LINK}>
              {tl("refunds")}
            </Link>
          </nav>
          <p>{t("footer.copyright", { year: String(new Date().getFullYear()) })}</p>
        </div>
      </div>
    </footer>
  );
}
