import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CONTACT_EMAIL } from "@/lib/site";

export function Footer() {
  const t = useTranslations("common");
  const tl = useTranslations("legal.footer");

  return (
    <footer className="border-t border-gray-100 px-6 py-12">
      <div className="mx-auto max-w-5xl text-center text-sm text-gray-500">
        <nav
          aria-label={tl("navLabel")}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
        >
          <Link
            href="/terms"
            className="text-gray-600 transition-colors hover:text-gray-900"
          >
            {tl("terms")}
          </Link>
          <Link
            href="/privacy"
            className="text-gray-600 transition-colors hover:text-gray-900"
          >
            {tl("privacy")}
          </Link>
          <Link
            href="/refunds"
            className="text-gray-600 transition-colors hover:text-gray-900"
          >
            {tl("refunds")}
          </Link>
        </nav>

        <p className="mt-6">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-gray-600 transition-colors hover:text-gray-900"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="mt-2">
          {t("footer.copyright", { year: String(new Date().getFullYear()) })}
        </p>
      </div>
    </footer>
  );
}
