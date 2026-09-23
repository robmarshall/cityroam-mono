import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, sentryOptions } from "@/lib/sentry-options";

if (SENTRY_DSN) {
  Sentry.init(sentryOptions());
}
