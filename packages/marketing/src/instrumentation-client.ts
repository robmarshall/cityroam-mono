import { SENTRY_DSN, sentryOptions } from "@/lib/sentry-options";

// NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so without it this branch
// (and the Sentry SDK chunk) is dropped from the client bundle entirely.
if (SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => Sentry.init(sentryOptions()));
}
