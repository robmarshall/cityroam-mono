import { useTranslations } from "next-intl";
import { factValues } from "@/lib/facts";

/**
 * The four things every visitor asks first, under the hero call to action:
 * price, group size, duration and when you can play. Numbers come from
 * lib/site.ts, so they match the FAQ and the checkout.
 */
export function KeyFacts({ align = "center" }: { align?: "center" | "start-lg" }) {
  const t = useTranslations("facts");
  const values = factValues(t);
  const items = [
    t("price", values),
    t("players", values),
    t("duration", values),
    t("validity", values),
  ];

  return (
    <ul
      aria-label={t("label")}
      className={`mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-gray-700 sm:text-base ${
        align === "start-lg" ? "lg:justify-start" : ""
      }`}
    >
      {items.map((item) => (
        // Each fact carries its own marker, so a wrapped line never starts
        // with a stray separator.
        <li key={item} className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** "About £3 each for a group of 10", shown next to the price. */
export function PerHead({ className = "" }: { className?: string }) {
  const t = useTranslations("facts");
  return <p className={className}>{t("perHead", factValues(t))}</p>;
}
