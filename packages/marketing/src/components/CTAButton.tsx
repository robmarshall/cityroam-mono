"use client";

import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { trackEvent } from "@/lib/analytics";

export function CTAButton({ location }: { location: "hero" | "pricing" | "faq" }) {
  function handleClick() {
    trackEvent(POSTHOG_EVENTS.CTA_CLICKED, { location });
    // Checkout flow will be implemented in task 7.3
    // For now, scroll to pricing if from hero, or no-op
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-button bg-brand-500 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700"
    >
      Book Your Hunt
    </button>
  );
}
