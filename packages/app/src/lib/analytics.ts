import posthog from "posthog-js";
import type {
  TrackEventFn,
  PostHogEventProperties,
} from "@cityroam/shared/analytics";

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

const POSTHOG_KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    persistence: "localStorage+cookie",
  });
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
  if (!POSTHOG_KEY) return;
  const properties = args[0];
  posthog.capture(eventName as string, properties as Record<string, unknown>);
};

// ---------------------------------------------------------------------------
// Re-export posthog instance for identify/reset
// ---------------------------------------------------------------------------

export { posthog };
