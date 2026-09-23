import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Version half of the Sentry release; the `marketing@` prefix is added in code
// (src/lib/sentry-options.ts). NEXT_PUBLIC_SENTRY_RELEASE holds only a version
// or SHA; failing that, use the build's git SHA from Vercel or Coolify.
const sentryReleaseVersion = (
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.SOURCE_COMMIT ||
  ""
).trim();

const nextConfig: NextConfig = {
  output: "standalone",
  // Inlined into client, server and edge bundles alike.
  env: { SENTRY_RELEASE_VERSION: sentryReleaseVersion },
};

const config = withNextIntl(nextConfig);

// Sentry is opt-in. Without a DSN the build is exactly as before. Source maps
// are only uploaded when SENTRY_AUTH_TOKEN (+ SENTRY_ORG / SENTRY_PROJECT) is
// present at build time.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      // Upload source maps under the same namespaced release the SDK reports.
      // Without a version, don't let the plugin create an unprefixed release.
      release: sentryReleaseVersion
        ? { name: `marketing@${sentryReleaseVersion}` }
        : { create: false },
    })
  : config;
