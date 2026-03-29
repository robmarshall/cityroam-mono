"use client";

import { useState } from "react";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { trackEvent } from "@/lib/analytics";

const FAQ_ITEMS = [
  {
    question: "How many people can play?",
    answer: "Up to 10 people can join a single experience. Everyone plays together on their own phone, sharing clues and solving puzzles as a group.",
  },
  {
    question: "How long does it take?",
    answer: "Most groups finish in 2\u20133 hours, but you can take your time \u2014 there\u2019s no clock. Stop for a coffee, explore a side street, whatever you like.",
  },
  {
    question: "What do I need?",
    answer: "Just a phone with internet access. No app to download \u2014 everything runs in your browser.",
  },
  {
    question: "Is it accessible?",
    answer: "The route covers approximately 2.5 miles of city centre walking on paved surfaces. It\u2019s suitable for wheelchairs and pushchairs, and avoids steep hills. If you have specific accessibility needs, get in touch and we\u2019ll help.",
  },
  {
    question: "Is it suitable for kids?",
    answer: "Kids aged 8+ will enjoy solving clues and exploring. Younger kids might need help with trickier clues. The route is pushchair friendly too.",
  },
  {
    question: "What if it rains?",
    answer: "Light rain? No problem \u2014 there are plenty of cosy spots to duck into. If it pours, you can pause your game and pick it up later. Your adventure is flexible.",
  },
  {
    question: "Is it dog friendly?",
    answer: "Definitely. Many stops are outdoors or near dog-friendly pubs. Bring your furry companion along for the adventure.",
  },
  {
    question: "Can I pause and continue another day?",
    answer: "Yes! If you want to pause mid-hunt and pick it up tomorrow, that\u2019s totally fine. Your progress is saved automatically.",
  },
  {
    question: "Can I go alone?",
    answer: "You can! The experience is just as fun solo. But many people enjoy doing it as a couple, with friends, or as part of a team.",
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
