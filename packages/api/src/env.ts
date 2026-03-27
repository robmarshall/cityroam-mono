const DEFAULTS: Record<string, string> = {
  DATABASE_URL: "postgresql://cityroam:cityroam@localhost:5432/cityroam",
  REDIS_URL: "redis://localhost:6379",
  BASE_DOMAIN: "localhost",
  NODE_ENV: "development",
  PORT: "3001",
  WS_PORT: "3002",
};

const DEV_PLACEHOLDER = "dev-placeholder";

const REQUIRED_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "DEEPSEEK_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
  "AWS_REGION",
  "AWS_CDN_BASE_URL",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "COOKIE_DOMAIN",
  "REVIEW_LINK",
  "MARKETING_URL",
  "APP_URL",
  "ADMIN_URL",
  "BASE_DOMAIN",
] as const;

/** Vars that must be set even in development mode. */
const DEV_REQUIRED_VARS = ["DATABASE_URL", "REDIS_URL"] as const;

function getEnvValue(key: string): string | undefined {
  return process.env[key] ?? DEFAULTS[key];
}

export function validateEnv(): void {
  const isDev =
    (process.env.NODE_ENV ?? DEFAULTS.NODE_ENV) === "development";

  const requiredToCheck = isDev ? DEV_REQUIRED_VARS : REQUIRED_VARS;

  const missing = requiredToCheck.filter((key) => !getEnvValue(key));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}`,
    );
  }
}

function buildEnv() {
  const isDev =
    (process.env.NODE_ENV ?? DEFAULTS.NODE_ENV) === "development";

  const resolve = (key: string): string => {
    const val = getEnvValue(key);
    if (val) return val;
    // In dev mode, non-critical vars get a placeholder so the app can start
    if (isDev) return DEV_PLACEHOLDER;
    // Production vars without a value should have been caught by validateEnv
    return "";
  };

  return {
    // Required
    DATABASE_URL: resolve("DATABASE_URL"),
    REDIS_URL: resolve("REDIS_URL"),
    STRIPE_SECRET_KEY: resolve("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: resolve("STRIPE_WEBHOOK_SECRET"),
    STRIPE_PRICE_ID: resolve("STRIPE_PRICE_ID"),
    RESEND_API_KEY: resolve("RESEND_API_KEY"),
    RESEND_FROM_EMAIL: resolve("RESEND_FROM_EMAIL"),
    DEEPSEEK_API_KEY: resolve("DEEPSEEK_API_KEY"),
    AWS_ACCESS_KEY_ID: resolve("AWS_ACCESS_KEY_ID"),
    AWS_SECRET_ACCESS_KEY: resolve("AWS_SECRET_ACCESS_KEY"),
    AWS_S3_BUCKET: resolve("AWS_S3_BUCKET"),
    AWS_REGION: resolve("AWS_REGION"),
    AWS_CDN_BASE_URL: resolve("AWS_CDN_BASE_URL"),
    ADMIN_USERNAME: resolve("ADMIN_USERNAME"),
    ADMIN_PASSWORD: resolve("ADMIN_PASSWORD"),
    SESSION_SECRET: resolve("SESSION_SECRET"),
    COOKIE_DOMAIN: resolve("COOKIE_DOMAIN"),
    REVIEW_LINK: resolve("REVIEW_LINK"),
    MARKETING_URL: resolve("MARKETING_URL"),
    APP_URL: resolve("APP_URL"),
    ADMIN_URL: resolve("ADMIN_URL"),
    BASE_DOMAIN: resolve("BASE_DOMAIN"),

    // Optional (always have defaults)
    NODE_ENV: process.env.NODE_ENV ?? DEFAULTS.NODE_ENV,
    PORT: process.env.PORT ?? DEFAULTS.PORT,
    WS_PORT: process.env.WS_PORT ?? DEFAULTS.WS_PORT,
  } as const;
}

// Validate on import
validateEnv();

export const env: ReturnType<typeof buildEnv> = buildEnv();
