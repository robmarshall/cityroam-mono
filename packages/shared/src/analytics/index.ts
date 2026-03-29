/**
 * PostHog Event Catalogue
 *
 * Type-safe event names and properties for analytics tracking.
 * Consuming packages (app, marketing) wrap trackEvent with their PostHog client.
 */

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

export const POSTHOG_EVENTS = {
  // Marketing site events
  PAGE_VIEWED: "page_viewed",
  CTA_CLICKED: "cta_clicked",
  FAQ_EXPANDED: "faq_expanded",
  CHECKOUT_STARTED: "checkout_started",
  CHECKOUT_COMPLETED: "checkout_completed",
  EVENT_LINK_COPIED: "event_link_copied",
  EVENT_LINK_SHARED: "event_link_shared",

  // App events
  GAME_JOINED: "game_joined",
  GAME_STARTED: "game_started",
  GAME_COMPLETED: "game_completed",
  GAME_ABANDONED: "game_abandoned",
  REVIEW_LINK_CLICKED: "review_link_clicked",
  PARTICIPANT_RECONNECTED: "participant_reconnected",
} as const;

export type PostHogEventName =
  (typeof POSTHOG_EVENTS)[keyof typeof POSTHOG_EVENTS];

// ---------------------------------------------------------------------------
// Typed properties per event
// ---------------------------------------------------------------------------

export interface PostHogEventProperties {
  [POSTHOG_EVENTS.PAGE_VIEWED]: { page: string; referrer: string };
  [POSTHOG_EVENTS.CTA_CLICKED]: { location: string };
  [POSTHOG_EVENTS.FAQ_EXPANDED]: { question: string };
  [POSTHOG_EVENTS.CHECKOUT_STARTED]: { price: number };
  [POSTHOG_EVENTS.CHECKOUT_COMPLETED]: { event_code: string };
  [POSTHOG_EVENTS.EVENT_LINK_COPIED]: { event_code: string };
  [POSTHOG_EVENTS.EVENT_LINK_SHARED]: { event_code: string; share_method: string };
  [POSTHOG_EVENTS.GAME_JOINED]: { event_code: string; is_lead: boolean; participant_count: number };
  [POSTHOG_EVENTS.GAME_STARTED]: { event_code: string; participant_count: number };
  [POSTHOG_EVENTS.GAME_COMPLETED]: { event_code: string; participant_count: number; duration_minutes: number; stops_completed: number };
  [POSTHOG_EVENTS.GAME_ABANDONED]: { event_code: string; current_stop: number; duration_minutes: number };
  [POSTHOG_EVENTS.REVIEW_LINK_CLICKED]: { event_code: string; platform: "google" | "tripadvisor" };
  [POSTHOG_EVENTS.PARTICIPANT_RECONNECTED]: { event_code: string; offline_duration_seconds: number };
}

// ---------------------------------------------------------------------------
// Type-safe track helper (type-only — consuming packages inject PostHog client)
// ---------------------------------------------------------------------------

export type TrackEventFn = <K extends keyof PostHogEventProperties>(
  eventName: K,
  ...args: Record<string, never> extends PostHogEventProperties[K]
    ? [properties?: PostHogEventProperties[K]]
    : [properties: PostHogEventProperties[K]]
) => void;
