import { vi } from "vitest";

// ── Mock env module BEFORE anything imports it ──────────────────────
vi.mock("../env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_WEBHOOK_SECRET: "whsec_test_fake",
    STRIPE_PRICE_ID: "price_test_fake",
    RESEND_API_KEY: "re_test_fake",
    RESEND_FROM_EMAIL: "test@cityroam.com",
    DEEPSEEK_API_KEY: "dk_test_fake",
    AWS_ACCESS_KEY_ID: "AKIATEST",
    AWS_SECRET_ACCESS_KEY: "secret_test",
    AWS_S3_BUCKET: "test-bucket",
    AWS_REGION: "eu-west-2",
    AWS_CDN_BASE_URL: "https://cdn.test.com",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "admin123",
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    COOKIE_DOMAIN: ".test.com",
    REVIEW_LINK: "https://review.test.com",
    MARKETING_URL: "https://marketing.test.com",
    APP_URL: "https://app.test.com",
    APP_PUBLIC_URL: "https://app.test.com/app",
    ADMIN_URL: "https://admin.test.com",
    BASE_DOMAIN: "test.com",
    NODE_ENV: "development",
    PORT: "3001",
    WS_PORT: "3002",
  },
  validateEnv: vi.fn(),
}));

// ── Mock Redis module ───────────────────────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
    setex: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    rpush: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
  },
  redisSub: {
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  },
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock S3 service ─────────────────────────────────────────────────
vi.mock("../services/s3.js", () => ({
  generatePresignedUploadUrl: vi.fn().mockResolvedValue({
    upload_url: "https://s3.test.com/presigned-url",
    key: "uploads/test-file.jpg",
  }),
}));

// ── Mock event-expiry service ───────────────────────────────────────
vi.mock("../services/event-expiry.js", () => ({
  sweepExpiredEvents: vi.fn().mockResolvedValue(0),
  startExpirySweep: vi.fn(),
  stopExpirySweep: vi.fn(),
}));
