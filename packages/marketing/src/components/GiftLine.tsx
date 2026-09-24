import { useTranslations } from "next-intl";
import { VOUCHER_EXPIRY_MONTHS } from "@cityroam/shared/constants";
import { Link } from "@/i18n/navigation";

/**
 * One line for gift buyers, under the price, pointing at the gift code page
 * (/gift). The copy lives in messages/gift/*.json with the voucher pages.
 */
export function GiftLine({ className = "" }: { className?: string }) {
  const t = useTranslations("gift");

  return (
    <p className={`flex items-start gap-3 text-base leading-relaxed text-ink-700 ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-brick-500"
      >
        <rect x={3.5} y={9} width={17} height={11.5} rx={1.5} />
        <path d="M2.5 9h19M12 9v11.5M12 9c-1.5-3.5-5.5-4.5-5.5-2 0 1.6 2.8 2 5.5 2Zm0 0c1.5-3.5 5.5-4.5 5.5-2 0 1.6-2.8 2-5.5 2Z" />
      </svg>
      <span>
        {t.rich("line", {
          months: VOUCHER_EXPIRY_MONTHS,
          b: (chunks) => <strong className="font-semibold text-ink-900">{chunks}</strong>,
          link: (chunks) => (
            <Link
              href="/gift"
              className="font-medium text-brick-600 underline underline-offset-2 hover:text-ink-900"
            >
              {chunks}
            </Link>
          ),
        })}
      </span>
    </p>
  );
}
