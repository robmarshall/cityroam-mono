/**
 * Optional Sentry error monitoring for the API processes.
 *
 * Entirely opt-in: with SENTRY_DSN unset (dev, tests, CI) nothing is
 * initialised and every export here is a no-op. Performance tracing is off —
 * this is for errors only.
 *
 * No PII leaves the process: sendDefaultPii stays false, cookies / auth headers
 * / request bodies are dropped, and event codes and session tokens are
 * scrubbed out of every URL we report (they are bearer credentials for a hunt).
 */
import * as Sentry from "@sentry/node";
import type { Breadcrumb, ErrorEvent } from "@sentry/node";

let enabled = false;

const PATH_CREDENTIAL = /\/(event|events|ws)\/([^/?#\s]+)/gi;
const QUERY_CREDENTIAL =
  /([?&](?:token|code|session|session_id|sessionId|event_code)=)[^&#\s]*/gi;

/** Strip event codes and session tokens out of a URL (or any string holding one). */
export function scrubUrl(value: string): string {
  return value
    .replace(PATH_CREDENTIAL, "/$1/[redacted]")
    .replace(QUERY_CREDENTIAL, "$1[redacted]");
}

const DROP_HEADERS = new Set(["cookie", "authorization", "x-session-token", "set-cookie"]);

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  const req = event.request;
  if (req) {
    if (req.url) req.url = scrubUrl(req.url);
    if (typeof req.query_string === "string") {
      req.query_string = scrubUrl(`?${req.query_string}`).slice(1);
    } else if (req.query_string) {
      req.query_string = undefined;
    }
    delete req.cookies;
    delete req.data;
    if (req.headers) {
      for (const key of Object.keys(req.headers)) {
        if (DROP_HEADERS.has(key.toLowerCase())) delete req.headers[key];
      }
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  delete event.user;
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  if (crumb.message) crumb.message = scrubUrl(crumb.message);
  if (crumb.data) {
    for (const key of ["url", "from", "to"]) {
      const v = crumb.data[key];
      if (typeof v === "string") crumb.data[key] = scrubUrl(v);
    }
  }
  return crumb;
}

/**
 * The whole monorepo reports into ONE Sentry project, so every package tags its
 * events with `service` and namespaces its release (`api@<ver>`, `app@<ver>`,
 * `admin@<ver>`, `marketing@<ver>`) so source maps and regressions can't cross-match.
 */
export type ApiService = "http" | "ws";

/** The `service` tag for an API process: `api-http` or `api-ws`. */
export function sentryServiceTag(service: ApiService): `api-${ApiService}` {
  return `api-${service}`;
}

/**
 * `api@<ver>`, where <ver> is SENTRY_RELEASE (a version or SHA, no prefix) or,
 * failing that, Coolify's SOURCE_COMMIT. Undefined when neither is set.
 */
export function sentryRelease(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const version = env.SENTRY_RELEASE?.trim() || env.SOURCE_COMMIT?.trim();
  return version ? `api@${version}` : undefined;
}

/**
 * Initialise Sentry for one API process. Returns whether it was enabled.
 * Call once, as early as possible in the process entry point.
 */
export function initSentry(service: ApiService): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || enabled) return enabled;

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    release: sentryRelease(),
    sendDefaultPii: false,
    // Errors only — no tracing spans.
    tracesSampleRate: 0,
    initialScope: { tags: { service: sentryServiceTag(service) } },
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });

  enabled = true;
  return true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Report an error that was handled (e.g. by the Hono error handler). */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Flush queued events before the process exits. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Never block shutdown on monitoring.
  }
}
