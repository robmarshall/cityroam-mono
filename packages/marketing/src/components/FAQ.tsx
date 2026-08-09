"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { trackEvent } from "@/lib/analytics";

const FAQ_COUNT = 10;

export function FAQ() {
  const t = useTranslations("faq");
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
    <div className="mx-auto max-w-2xl divide-y divide-gray-200">
      {Array.from({ length: FAQ_COUNT }, (_, index) => (
        <div key={index}>
          <button
            onClick={() => toggle(index)}
            className="flex w-full items-center justify-between py-5 text-left text-lg font-medium text-gray-900"
          >
            <span>{t(`${index}.question`)}</span>
            <svg
              className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${
                openIndex === index ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openIndex === index && (
            <p className="pb-5 text-gray-600 leading-relaxed">{t(`${index}.answer`)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
