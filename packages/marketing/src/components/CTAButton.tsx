"use client";

import { useState } from "react";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type { CheckoutSessionResponse } from "@cityroam/shared/types";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function CTAButton({
  location,
  label = "Book Your Experience",
}: {
  location: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    if (loading) return;

    trackEvent(POSTHOG_EVENTS.CTA_CLICKED, { location });
    trackEvent(POSTHOG_EVENTS.CHECKOUT_STARTED, { price: 29 });

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`${API_URL}/checkout/create-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error("Failed to create checkout session");
      }

      const data: CheckoutSessionResponse = await res.json();
      window.location.href = data.url;
    } catch {
      setLoading(false);
      setError(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-button bg-brand-500 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {loading ? "Redirecting to checkout..." : label}
      </button>
      {error && (
        <p className="text-sm text-red-600">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
