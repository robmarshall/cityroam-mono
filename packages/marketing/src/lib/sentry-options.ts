/**
 * Shared Sentry options for every Next.js runtime (browser, Node, edge).
 *
 * Sentry is opt-in: with NEXT_PUBLIC_SENTRY_DSN unset nothing is initialised.
 * No PII: dataCollection is pinned to the old sendDefaultPii-off baseline, no
 * replay or tracing, and Stripe checkout session ids, event codes and tokens
 * are scrubbed from reported URLs.
 */
import type { Breadcrumb, ErrorEvent, init } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

/**
 * The whole monorepo reports into ONE Sentry project: events are told apart by
 * the `service` tag, and releases are namespaced per package (`marketing@<ver>`)
 * so source maps can't cross-match with the app, admin or API.
 */
export const SENTRY_SERVICE = "marketing";

/**
 * `marketing@<ver>`. next.config.ts resolves <ver> at build time
 * (NEXT_PUBLIC_SENTRY_RELEASE, else the Vercel / Coolify git SHA) and inlines it
 * as SENTRY_RELEASE_VERSION, so client, server and edge all agree.
 */
const releaseVersion = process.env.SENTRY_RELEASE_VERSION?.trim();
export const SENTRY_RELEASE = releaseVersion ? `${SENTRY_SERVICE}@${releaseVersion}` : undefined;

const PATH_CREDENTIAL = /\/(event|events|ws)\/([^/?#\s]+)/gi;
const QUERY_CREDENTIAL =
  /([?&](?:token|code|session|session_id|sessionId|event_code)=)[^&#\s]*/gi;

export function scrubUrl(value: string): string {
  return value
    .replace(PATH_CREDENTIAL, "/$1/[redacted]")
    .replace(QUERY_CREDENTIAL, "$1[redacted]");
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (["cookie", "authorization"].includes(key.toLowerCase())) {
          delete event.request.headers[key];
        }
      }
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  delete event.user;
  return event;
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  if (crumb.message) crumb.message = scrubUrl(crumb.message);
  if (crumb.data) {
    for (const key of ["url", "from", "to"]) {
      const v = crumb.data[key];
      if (typeof v === "string") crumb.data[key] = scrubUrl(v);
    }
  }
  return crumb;
}

/** The SDK's own v10 denylist for headers and query params (from its migration guide). */
const PII_HEADER_DENYLIST = ["forwarded", "-ip", "remote-", "via", "-user"];

/** Typed so a renamed or removed SDK option fails the typecheck. */
export function sentryOptions(): NonNullable<Parameters<typeof init>[0]> {
  return {
    dsn: SENTRY_DSN,
    enabled: Boolean(SENTRY_DSN),
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.NODE_ENV,
    release: SENTRY_RELEASE,
    initialScope: { tags: { service: SENTRY_SERVICE } },
    // SDK v11 replaced `sendDefaultPii` with `dataCollection`, and leaving it
    // unset now collects cookies, bodies and user info. Spell out the v10
    // `sendDefaultPii: false` baseline so nothing new is sent.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: PII_HEADER_DENYLIST },
        response: { deny: PII_HEADER_DENYLIST },
      },
      httpBodies: [],
      urlQueryParams: { deny: PII_HEADER_DENYLIST },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
    // v11 defaults this to true; keep v10's behaviour.
    attachStacktrace: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
