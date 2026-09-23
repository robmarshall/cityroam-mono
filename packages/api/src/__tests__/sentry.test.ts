import { describe, it, expect } from "vitest";
import {
  scrubUrl,
  scrubEvent,
  scrubBreadcrumb,
  captureError,
  flushSentry,
  isSentryEnabled,
  sentryRelease,
  sentryServiceTag,
} from "../lib/sentry.js";

describe("scrubUrl", () => {
  it("redacts event codes in paths", () => {
    expect(scrubUrl("https://api.test.com/event/abcd2345/join")).toBe(
      "https://api.test.com/event/[redacted]/join",
    );
    expect(scrubUrl("/ws/abcd2345?token=11111111-2222")).toBe("/ws/[redacted]?token=[redacted]");
  });

  it("redacts credential query parameters but keeps others", () => {
    expect(scrubUrl("/success?session_id=cs_test_123&lang=en")).toBe(
      "/success?session_id=[redacted]&lang=en",
    );
    expect(scrubUrl("/join?code=abcd2345")).toBe("/join?code=[redacted]");
  });

  it("leaves unrelated URLs alone", () => {
    expect(scrubUrl("/health")).toBe("/health");
  });
});

describe("scrubEvent", () => {
  it("drops cookies, bodies, auth headers and user", () => {
    const event: any = {
      request: {
        url: "https://api.test.com/event/abcd2345/messages",
        query_string: "token=abc",
        cookies: { cr_session: "x" },
        data: { name: "Bob" },
        headers: { Cookie: "a=b", Authorization: "Bearer x", "User-Agent": "ua" },
      },
      transaction: "GET /event/abcd2345/messages",
      user: { ip_address: "1.2.3.4" },
      breadcrumbs: [{ category: "fetch", data: { url: "/event/abcd2345" } }],
    };

    const out: any = scrubEvent(event);

    expect(out.request.url).toBe("https://api.test.com/event/[redacted]/messages");
    expect(out.request.query_string).toBe("token=[redacted]");
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.data).toBeUndefined();
    expect(out.request.headers).toEqual({ "User-Agent": "ua" });
    expect(out.transaction).toBe("GET /event/[redacted]/messages");
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs[0].data.url).toBe("/event/[redacted]");
  });

  it("scrubs navigation breadcrumbs", () => {
    const crumb = scrubBreadcrumb({ category: "navigation", data: { from: "/event/a", to: "/event/b/play" } });
    expect(crumb.data).toEqual({ from: "/event/[redacted]", to: "/event/[redacted]/play" });
  });
});

describe("without SENTRY_DSN", () => {
  it("is disabled and every call is a no-op", async () => {
    expect(isSentryEnabled()).toBe(false);
    expect(() => captureError(new Error("boom"))).not.toThrow();
    await expect(flushSentry()).resolves.toBeUndefined();
  });
});

describe("single-project tagging", () => {
  it("tags each API process as api-http / api-ws", () => {
    expect(sentryServiceTag("http")).toBe("api-http");
    expect(sentryServiceTag("ws")).toBe("api-ws");
  });

  it("namespaces the release as api@<ver>, preferring SENTRY_RELEASE", () => {
    expect(sentryRelease({ SENTRY_RELEASE: " 1.4.0 ", SOURCE_COMMIT: "abc123" })).toBe("api@1.4.0");
    expect(sentryRelease({ SOURCE_COMMIT: "abc123" })).toBe("api@abc123");
  });

  it("leaves the release undefined when no version is available", () => {
    expect(sentryRelease({})).toBeUndefined();
    expect(sentryRelease({ SENTRY_RELEASE: "  " })).toBeUndefined();
  });
});
