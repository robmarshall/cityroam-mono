"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type { CheckoutSessionResponse } from "@cityroam/shared/types";
import { trackEvent } from "@/lib/analytics";
import { PRICE_GBP } from "@/lib/site";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Marketing segments the API maps to route families. "general" is the
 * homepage, which takes whatever family is configured as the default.
 */
export type CheckoutSegment =
  | "general"
  | "families"
  | "hen-parties"
  | "team-building";

const VARIANT_CLASSES = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-brand-600",
  // For use on the brand-coloured band, where a blue button would disappear.
  inverse:
    "bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-white",
} as const;

export function CTAButton({
  location,
  label,
  segment = "general",
  variant = "primary",
  align = "center",
}: {
  location: string;
  label?: string;
  segment?: CheckoutSegment;
  variant?: keyof typeof VARIANT_CLASSES;
  /** "start-lg" left-aligns from the lg breakpoint, to sit under left-aligned hero copy. */
  align?: "center" | "start-lg";
}) {
  const t = useTranslations("cta");
  const locale = useLocale();
  const displayLabel = label ?? t("defaultLabel");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    if (loading) return;

    trackEvent(POSTHOG_EVENTS.CTA_CLICKED, { location });
    trackEvent(POSTHOG_EVENTS.CHECKOUT_STARTED, { price: PRICE_GBP });

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`${API_URL}/checkout/create-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The API needs both to pick a hunt: without them it would fall back
        // to an arbitrary route and email the buyer in the wrong language.
        body: JSON.stringify({ segment, language: locale }),
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
    <div
      className={`flex flex-col items-center gap-2 ${align === "start-lg" ? "lg:items-start" : ""}`}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className={`inline-flex items-center justify-center rounded-button px-8 py-4 text-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${VARIANT_CLASSES[variant]}`}
      >
        {loading ? t("loading") : displayLabel}
      </button>
      {error && (
        <div
          role="alert"
          className={`flex flex-col items-center gap-1 ${align === "start-lg" ? "lg:items-start" : ""}`}
        >
          <p className={`text-sm ${variant === "inverse" ? "text-white" : "text-red-700"}`}>
            {t("error")}
          </p>
          <button
            type="button"
            onClick={handleClick}
            className={`text-sm font-medium underline ${
              variant === "inverse" ? "text-white hover:text-brand-50" : "text-brand-600 hover:text-brand-700"
            }`}
          >
            {t("retry")}
          </button>
        </div>
      )}
    </div>
  );
}
