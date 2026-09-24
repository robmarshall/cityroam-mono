"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { trackEvent } from "@/lib/analytics";

/**
 * Accordion of question/answer pairs read from `<namespace>.<i>.question` and
 * `<namespace>.<i>.answer`. Answers stay in the HTML when collapsed (`hidden`)
 * so they are still indexed and findable with in-page search.
 */
export function FAQ({
  namespace,
  count,
  values,
}: {
  namespace: string;
  count: number;
  /** Placeholder values for answers that quote facts, e.g. `{duration}`. */
  values?: Record<string, string | number>;
}) {
  const t = useTranslations(namespace);
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    const isOpening = openIndex !== index;
    setOpenIndex(isOpening ? index : null);
    if (isOpening) {
      trackEvent(POSTHOG_EVENTS.FAQ_EXPANDED, {
        question: t(`${index}.question`),
      });
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-2xl divide-y divide-gray-200 border-y border-gray-200">
      {Array.from({ length: count }, (_, index) => {
        const open = openIndex === index;
        const buttonId = `${baseId}-q${index}`;
        const panelId = `${baseId}-a${index}`;
        return (
          <div key={index}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-medium text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <span>{t(`${index}.question`)}</span>
                <svg
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${
                    open ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
              <p className="pb-5 leading-relaxed text-gray-600">{t(`${index}.answer`, values)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
