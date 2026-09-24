import { useTranslations } from "next-intl";
import { factValues } from "@/lib/facts";

/**
 * One line for gift buyers, under the price. It only promises what the
 * product does today: the booking email carries the game link, and the link
 * lasts LINK_VALID_DAYS from booking. Proper vouchers are a separate project.
 */
export function GiftLine({ className = "" }: { className?: string }) {
  const t = useTranslations("home");
  const values = factValues(useTranslations("facts"));

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
        {t.rich("gift", {
          ...values,
          b: (chunks) => <strong className="font-semibold text-ink-900">{chunks}</strong>,
        })}
      </span>
    </p>
  );
}
