import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// The global test setup replaces ../env.js with a fixture, so pull in the real
// module to exercise validateEnv itself.
const { validateEnv } = await vi.importActual<typeof import("../env.js")>(
  "../env.js",
);

const REQUIRED = {
  DATABASE_URL: "postgresql://u:p@db:5432/cityroam",
  REDIS_URL: "redis://redis:6379",
  STRIPE_SECRET_KEY: "sk_live",
  STRIPE_WEBHOOK_SECRET: "whsec",
  STRIPE_PRICE_ID: "price",
  RESEND_API_KEY: "re",
  DEEPSEEK_API_KEY: "dk",
  AWS_ACCESS_KEY_ID: "AKIA",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_S3_BUCKET: "bucket",
  AWS_REGION: "eu-west-2",
  AWS_CDN_BASE_URL: "https://cdn.example.com",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "hunter2",
  SESSION_SECRET: "x".repeat(48),
  COOKIE_DOMAIN: ".example.com",
  REVIEW_LINK: "https://review.example.com",
  RESEND_FROM_EMAIL: "hello@example.com",
  MARKETING_URL: "https://example.com",
  APP_URL: "https://app.example.com",
  APP_PUBLIC_URL: "https://app.example.com/app",
  ADMIN_URL: "https://admin.example.com",
};

describe("validateEnv", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of Object.keys(REQUIRED)) delete process.env[key];
    process.env.NODE_ENV = "production";
    Object.assign(process.env, REQUIRED);

    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("accepts a production config with a long session secret", () => {
    expect(() => validateEnv("http")).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("refuses to boot on a short SESSION_SECRET outside development", () => {
    process.env.SESSION_SECRET = "short-secret";

    expect(() => validateEnv("http")).toThrow("process.exit(1)");

    const message = String(errorSpy.mock.calls.at(-1)?.[0]);
    expect(message).toContain("SESSION_SECRET");
    expect(message).toContain("32");
  });

  it("accepts a secret of exactly the minimum length", () => {
    process.env.SESSION_SECRET = "y".repeat(32);

    expect(() => validateEnv("http")).not.toThrow();
  });

  it("leaves development alone so a placeholder secret still boots", () => {
    process.env.NODE_ENV = "development";
    process.env.SESSION_SECRET = "short";

    expect(() => validateEnv("http")).not.toThrow();
  });

  it("does not demand a session secret from the ws process", () => {
    delete process.env.SESSION_SECRET;

    expect(() => validateEnv("ws")).not.toThrow();
  });

  it("still reports a missing variable before checking the secret", () => {
    delete process.env.COOKIE_DOMAIN;

    expect(() => validateEnv("http")).toThrow("process.exit(1)");
    const message = String(errorSpy.mock.calls.at(-1)?.[0]);
    expect(message).toContain("COOKIE_DOMAIN");
  });
});
