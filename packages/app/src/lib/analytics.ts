import type { PostHog } from "posthog-js";
import type {
  TrackEventFn,
  PostHogEventProperties,
} from "@cityroam/shared/analytics";

// ---------------------------------------------------------------------------
// Lazy initialisation
//
// posthog-js is a large dependency and nothing on the critical path needs it,
// so it is fetched after first paint. Initialisation still happens
// unconditionally (no first-event trigger required); events captured before the
// bundle lands are queued and flushed on arrival.
// ---------------------------------------------------------------------------

const POSTHOG_KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST: string =
  import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

/** Give the idle callback a deadline so analytics still start on a busy page. */
const IDLE_LOAD_TIMEOUT_MS = 3000;
/** Fallback delay where requestIdleCallback is unavailable (Safari). */
const IDLE_LOAD_FALLBACK_MS = 2000;
/** Cap the pre-load queue so a failed fetch can never grow unbounded. */
const MAX_QUEUED_EVENTS = 50;

interface QueuedEvent {
  name: string;
  properties?: Record<string, unknown>;
}

let client: PostHog | null = null;
let loadPromise: Promise<PostHog | null> | null = null;
const queue: QueuedEvent[] = [];

function flushQueue(instance: PostHog): void {
  for (const queued of queue) {
    instance.capture(queued.name, queued.properties);
  }
  queue.length = 0;
}

function loadPostHog(): Promise<PostHog | null> {
  if (loadPromise) return loadPromise;
  if (!POSTHOG_KEY) {
    loadPromise = Promise.resolve(null);
    return loadPromise;
  }

  loadPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageview: false,
        persistence: "localStorage+cookie",
      });
      client = posthog;
      flushQueue(posthog);
      return posthog;
    })
    .catch(() => {
      // Analytics must never break the game. Drop anything queued and stay a
      // no-op for the rest of the session.
      queue.length = 0;
      return null;
    });

  return loadPromise;
}

function scheduleLoad(): void {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  const start = () => {
    void loadPostHog();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: IDLE_LOAD_TIMEOUT_MS });
  } else {
    window.setTimeout(start, IDLE_LOAD_FALLBACK_MS);
  }
}

scheduleLoad();

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
  const properties = args[0] as Record<string, unknown> | undefined;

  if (client) {
    client.capture(eventName as string, properties);
    return;
  }

  if (queue.length < MAX_QUEUED_EVENTS) {
    queue.push({ name: eventName as string, properties });
  }
  void loadPostHog();
};

// ---------------------------------------------------------------------------
// Access to the instance for identify/reset, once it has loaded
// ---------------------------------------------------------------------------

export function getPostHog(): Promise<PostHog | null> {
  return loadPostHog();
}
