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

/**
 * Contrast (see docs/plans/brand-direction-a.md and the contrast test):
 * white on brick-500 is 5.45:1 and on brick-600 6.99:1; ink-900 on stone-50
 * is 14.19:1. Brick on navy fails (2.93:1), so navy bands use `inverse`.
 */
const VARIANT_CLASSES = {
  primary: "bg-brick-500 text-white hover:bg-brick-600 active:bg-brick-600",
  // Quieter action on stone or white: a navy outline.
  secondary:
    "bg-transparent text-ink-900 ring-2 ring-inset ring-ink-900 hover:bg-ink-900 hover:text-stone-50 active:bg-ink-700",
  // For navy bands, where a brick button would fail contrast.
  inverse: "bg-stone-50 text-ink-900 hover:bg-white active:bg-stone-100",
} as const;

export function CTAButton({
  location,
  label,
  segment = "general",
  variant = "primary",
  align = "center",
  fullWidth = false,
  sticky = false,
}: {
  location: string;
  label?: string;
  segment?: CheckoutSegment;
  variant?: keyof typeof VARIANT_CLASSES;
  /** "start-lg" left-aligns from the lg breakpoint, to sit under left-aligned hero copy. */
  align?: "center" | "start-lg";
  /** Stretch the button across its container (the mobile booking bar). */
  fullWidth?: boolean;
  /**
   * Set on the sticky booking bar's own button. Every other CTA is marked with
   * `data-book-cta` so the bar can hide while one of them is on screen.
   */
  sticky?: boolean;
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
      data-book-cta={sticky ? undefined : ""}
      className={`flex flex-col gap-2 ${fullWidth ? "items-stretch" : "items-center"} ${align === "start-lg" ? "lg:items-start" : ""}`}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className={`inline-flex items-center justify-center rounded-button font-semibold ${fullWidth ? "w-full px-6 py-3 text-base" : "px-8 py-4 text-lg"} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-70 ${VARIANT_CLASSES[variant]}`}
      >
        {loading ? t("loading") : displayLabel}
      </button>
      {error && (
        <div
          role="alert"
          className={`flex flex-col items-center gap-1 ${align === "start-lg" ? "lg:items-start" : ""}`}
        >
          <p className={`text-sm ${variant === "inverse" ? "text-stone-50" : "text-red-700"}`}>
            {t("error")}
          </p>
          <button
            type="button"
            onClick={handleClick}
            className={`text-sm font-medium underline underline-offset-2 ${
              variant === "inverse" ? "text-stone-50 hover:text-white" : "text-brick-600 hover:text-ink-900"
            }`}
          >
            {t("retry")}
          </button>
        </div>
      )}
    </div>
  );
}
