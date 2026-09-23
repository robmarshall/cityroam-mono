/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_WS_URL: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_REVIEW_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build-time git SHA (Vercel/Coolify) injected by vite.config.ts; "" when unknown. */
declare const __SENTRY_BUILD_SHA__: string;
