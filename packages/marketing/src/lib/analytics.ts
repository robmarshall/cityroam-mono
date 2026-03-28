"use client";

import posthog from "posthog-js";
import type {
  TrackEventFn,
  PostHogEventProperties,
} from "@cityroam/shared/analytics";

// ---------------------------------------------------------------------------
// Initialisation (client-side only)
// ---------------------------------------------------------------------------

const POSTHOG_KEY: string | undefined =
  process.env.NEXT_PUBLIC_POSTHOG_KEY;

let initialized = false;

function ensureInit() {
  if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

// ---------------------------------------------------------------------------
// Type-safe track helper
// ---------------------------------------------------------------------------

export const trackEvent: TrackEventFn = <
  K extends keyof PostHogEventProperties,
>(
  eventName: K,
  ...args: Record<string, never> extends PostHogEventProperties[K]
    ? [properties?: PostHogEventProperties[K]]
    : [properties: PostHogEventProperties[K]]
): void => {
  ensureInit();
  if (!POSTHOG_KEY) return;
  const properties = args[0];
  posthog.capture(eventName as string, properties as Record<string, unknown>);
};

// ---------------------------------------------------------------------------
// Re-export posthog instance for identify/reset
// ---------------------------------------------------------------------------

export { posthog, ensureInit };
