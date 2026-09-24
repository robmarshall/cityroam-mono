import { useTranslations } from "next-intl";
import { OwlMark } from "@/components/OwlMark";
import { factValues } from "@/lib/facts";
import { COMPANY } from "@/lib/site";

/** 24-unit line icons, drawn in currentColor like the owl. */
function RefundIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
      <text x={12} y={15.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="currentColor" stroke="none">
        £
      </text>
    </svg>
  );
}

function UmbrellaIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 18 0Z" />
      <path d="M12 12v6.5a2 2 0 0 1-4 0" />
    </svg>
  );
}

/**
 * Three reasons it's safe to book: the refund promise, the 90-day link (so
 * rain costs nothing) and who is behind it. Sits on a white band, so the
 * brick icons are 5.45:1.
 */
export function TrustStrip({ note }: { note?: React.ReactNode }) {
  const t = useTranslations("home.trust");
  const values = factValues(useTranslations("facts"));

  const items = [
    { key: "refund", icon: <RefundIcon /> },
    { key: "rain", icon: <UmbrellaIcon /> },
    { key: "local", icon: <OwlMark size={28} /> },
  ] as const;

  return (
    <div>
      <h2 className="sr-only">{t("label")}</h2>
      <ul className="grid gap-10 sm:grid-cols-3 sm:gap-8">
        {items.map(({ key, icon }) => (
          <li key={key} className="flex gap-4 sm:flex-col sm:gap-3">
            <span className="text-brick-500">{icon}</span>
            <div>
              <h3 className="font-display text-xl font-semibold text-ink-900">
                {t(`${key}.title`, values)}
              </h3>
              <p className="mt-2 leading-relaxed text-muted">
                {t(`${key}.text`, { ...values, name: COMPANY.name, number: COMPANY.number })}
              </p>
              {key === "local" && note && <div className="mt-5">{note}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
