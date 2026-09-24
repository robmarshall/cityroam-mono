import { useTranslations } from "next-intl";
import { factValues } from "@/lib/facts";
import type { RouteFacts } from "@/lib/route-facts";

/**
 * The practical facts about a route as a short definition list. Rows whose
 * value is null are left out entirely: the box only says what has been
 * checked, and grows as Rob fills in lib/route-facts.ts (later, the route
 * facts endpoint).
 */
export function RouteAtAGlance({ facts }: { facts: RouteFacts }) {
  const t = useTranslations("home.route");
  const tf = useTranslations("facts");
  const values = factValues(tf);

  const rows: [label: string, value: string][] = [];
  if (facts.startPoint) rows.push([t("rows.start"), facts.startPoint]);
  if (facts.distanceKm != null) {
    const km = facts.distanceKm;
    rows.push([t("rows.distance"), tf("distance", { km, miles: Math.round(km * 0.621371 * 10) / 10 })]);
  }
  if (facts.durationMins != null) {
    rows.push([t("rows.duration"), tf("duration", { hours: facts.durationMins / 60 })]);
  }
  if (facts.stops != null) {
    rows.push([t("rows.stops"), t("values.stops", { ...values, stops: facts.stops })]);
  }
  if (facts.stepFree) rows.push([t("rows.stepFree"), t(`values.stepFree.${facts.stepFree}`)]);
  if (facts.dogs != null) rows.push([t("rows.dogs"), t(`values.dogs.${facts.dogs ? "yes" : "no"}`)]);
  if (facts.toilets != null) {
    rows.push([t("rows.toilets"), t(`values.toilets.${facts.toilets ? "yes" : "no"}`)]);
  }
  if (facts.covered) rows.push([t("rows.covered"), t(`values.covered.${facts.covered}`)]);

  return (
    <dl className="divide-y divide-stone-200 border-y border-stone-200">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
          <dt className="text-sm font-semibold tracking-wide text-muted uppercase">{label}</dt>
          <dd className="text-right font-display text-lg text-ink-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
