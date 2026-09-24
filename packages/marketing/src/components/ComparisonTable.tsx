import { useTranslations } from "next-intl";
import { factValues } from "@/lib/facts";

const COLUMNS = ["cityRoam", "printed", "appHunt", "tour"] as const;
const ROW_COUNT = 7;

/**
 * City Roam against generic kinds of alternative. The other columns are
 * categories, never named companies, and their cells are hedged ("usually",
 * "often") because they describe what's typical: keep them that way. Only
 * put things in the City Roam column that the product actually does.
 *
 * On phones the table scrolls sideways inside its own box, with the first
 * column pinned, so the page itself never scrolls horizontally.
 */
export function ComparisonTable() {
  const t = useTranslations("home.compare");
  const tf = useTranslations("facts");
  const values = factValues(tf);

  return (
    <>
      <p className="mt-8 text-center text-sm text-muted md:hidden">{t("scrollHint")}</p>
      <div
        role="region"
        aria-label={t("caption")}
        // Focusable so keyboard users can scroll it sideways.
        tabIndex={0}
        className="mt-4 overflow-x-auto md:mt-12 rounded-card bg-white ring-1 ring-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
      >
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm sm:text-base">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-stone-200">
              <th
                scope="col"
                className="sticky left-0 z-10 w-36 bg-white px-4 py-3 font-semibold text-muted shadow-[1px_0_0_0_var(--color-stone-200)] sm:w-48"
              >
                <span className="sr-only">{t("columns.feature")}</span>
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className={`px-4 py-3 align-bottom font-semibold ${
                    col === "cityRoam" ? "bg-brick-100 text-brick-600" : "text-ink-900"
                  }`}
                >
                  {t(`columns.${col}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <tr key={i} className="border-b border-stone-200 last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-3 align-top font-medium text-ink-900 shadow-[1px_0_0_0_var(--color-stone-200)]"
                >
                  {t(`rows.${i}.label`)}
                </th>
                {COLUMNS.map((col) => (
                  <td
                    key={col}
                    className={`px-4 py-3 align-top ${
                      col === "cityRoam" ? "bg-brick-100 font-medium text-ink-900" : "text-muted"
                    }`}
                  >
                    {t(`rows.${i}.${col}`, values)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
