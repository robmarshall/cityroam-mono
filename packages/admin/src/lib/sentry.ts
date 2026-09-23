/**
 * Optional Sentry error monitoring. With VITE_SENTRY_DSN unset (dev, tests,
 * any build without the arg) nothing is initialised.
 *
 * No PII: sendDefaultPii stays off, no replay/tracing, and event codes and
 * session tokens are scrubbed from every reported URL.
 */
import * as Sentry from "@sentry/react";

const PATH_CREDENTIAL = /\/(event|events|ws)\/([^/?#\s]+)/gi;
const QUERY_CREDENTIAL =
  /([?&](?:token|code|session|session_id|sessionId|event_code)=)[^&#\s]*/gi;

export function scrubUrl(value: string): string {
  return value
    .replace(PATH_CREDENTIAL, "/$1/[redacted]")
    .replace(QUERY_CREDENTIAL, "$1[redacted]");
}

let enabled = false;

/**
 * The whole monorepo reports into ONE Sentry project: events are told apart by
 * the `service` tag, and releases are namespaced per package so source maps
 * can't cross-match. VITE_SENTRY_RELEASE holds only the version/SHA.
 */
export const SENTRY_SERVICE = "admin";

export function sentryRelease(): string | undefined {
  const buildSha = typeof __SENTRY_BUILD_SHA__ === "string" ? __SENTRY_BUILD_SHA__ : "";
  const version = import.meta.env.VITE_SENTRY_RELEASE?.trim() || buildSha.trim();
  return version ? `${SENTRY_SERVICE}@${version}` : undefined;
}

/** Initialise Sentry if a DSN was baked into the build. Returns whether it is on. */
export function initSentry(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
    release: sentryRelease(),
    initialScope: { tags: { service: SENTRY_SERVICE } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      if (event.request) {
        delete event.request.cookies;
        delete event.request.query_string;
      }
      if (event.transaction) event.transaction = scrubUrl(event.transaction);
      delete event.user;
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.message) crumb.message = scrubUrl(crumb.message);
      if (crumb.data) {
        for (const key of ["url", "from", "to"]) {
          const v = crumb.data[key];
          if (typeof v === "string") crumb.data[key] = scrubUrl(v);
        }
      }
      return crumb;
    },
  });
  enabled = true;
  return true;
}

/**
 * createRoot options that report errors React catches (including ones an
 * ErrorBoundary swallows). Empty when Sentry is off so React keeps its
 * default console reporting.
 */
export function sentryRootOptions() {
  if (!enabled) return {};
  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}
