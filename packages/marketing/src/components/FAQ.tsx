"use client";

import { useState } from "react";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { trackEvent } from "@/lib/analytics";

const FAQ_ITEMS = [
  {
    question: "How many people can play?",
    answer: "Up to 10 people can join a single hunt. Everyone plays together on their own phone, sharing clues and solving puzzles as a group.",
  },
  {
    question: "How long does it take?",
    answer: "About 90 minutes, but you can take your time — there's no clock. Stop for a coffee, explore a side street, whatever you like.",
  },
  {
    question: "What do I need?",
    answer: "Just a phone with internet access. No app to download — everything runs in your browser.",
  },
  {
    question: "Is it accessible?",
    answer: "The route covers approximately 2km of city centre walking on paved surfaces. If you have specific accessibility needs, get in touch and we'll help.",
  },
  {
    question: "What's the refund policy?",
    answer: "Full refund, no questions asked. If you're not happy for any reason, just let us know.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    const isOpening = openIndex !== index;
    setOpenIndex(isOpening ? index : null);
    if (isOpening) {
      trackEvent(POSTHOG_EVENTS.FAQ_EXPANDED, {
        question: FAQ_ITEMS[index].question,
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl divide-y divide-gray-200">
      {FAQ_ITEMS.map((item, index) => (
        <div key={index}>
          <button
            onClick={() => toggle(index)}
            className="flex w-full items-center justify-between py-5 text-left text-lg font-medium text-gray-900"
          >
            <span>{item.question}</span>
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
            <p className="pb-5 text-gray-600 leading-relaxed">{item.answer}</p>
          )}
        </div>
      ))}
    </div>
  );
}
