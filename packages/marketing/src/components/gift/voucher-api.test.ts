import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FINAL_PROBLEMS,
  createVoucherSession,
  fetchVoucherSuccess,
  formatCodeInput,
  isNoHuntAvailable,
  lookupVoucher,
  pollDelay,
  problemForFailure,
  problemForStatus,
  redeemVoucher,
  retryMinutes,
  toVoucherCode,
  voucherSessionBody,
  type ApiFailure,
} from "./voucher-api";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function mockFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("code input", () => {
  it("formats a code typed any way", () => {
    expect(formatCodeInput("abcdefghjk")).toBe("ABCD-EFGH-JK");
    expect(formatCodeInput(" abcd efgh jk ")).toBe("ABCD-EFGH-JK");
    expect(formatCodeInput("ab-cd-ef-gh-jk")).toBe("ABCD-EFGH-JK");
    expect(formatCodeInput("ABCD-EFGH-JK")).toBe("ABCD-EFGH-JK");
  });

  it("leaves something that isn't a code alone, upper-cased", () => {
    expect(formatCodeInput("abc")).toBe("ABC");
    expect(formatCodeInput("")).toBe("");
    expect(formatCodeInput("abcd-efgh-jkm")).toBe("ABCD-EFGH-JKM");
  });

  it("accepts only the voucher alphabet", () => {
    expect(toVoucherCode("abcd-efgh-jk")).toBe("ABCD-EFGH-JK");
    // 0, O, 1, I and L are never in a code.
    expect(toVoucherCode("ABCD-EFGH-J0")).toBeNull();
    expect(toVoucherCode("ABCD-EFGH-JO")).toBeNull();
    expect(toVoucherCode("ABCD-EFGH-JL")).toBeNull();
    expect(toVoucherCode("ABCD-EFGH")).toBeNull();
    expect(toVoucherCode("")).toBeNull();
  });
});

describe("buying", () => {
  it("posts JSON with the language and only the fields given", async () => {
    const fetch = mockFetch(json(200, { url: "https://checkout.stripe.com/c/1" }));
    const result = await createVoucherSession({ language: "fr", recipientName: "  Sam ", message: "   " });

    expect(result).toEqual({ ok: true, status: 200, data: { url: "https://checkout.stripe.com/c/1" } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/checkout\/create-voucher-session$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ language: "fr", recipient_name: "Sam" });
  });

  it("keeps the message's line breaks", () => {
    expect(voucherSessionBody({ language: "en", message: "Happy birthday\nLove, A" })).toEqual({
      language: "en",
      message: "Happy birthday\nLove, A",
    });
  });

  it("tells 'no hunt today' apart from a bad field", async () => {
    mockFetch(
      json(400, { error: "No hunt is currently available for this selection", code: "INVALID_INPUT" }),
      json(400, { error: "Recipient name must be at most 60 characters", code: "INVALID_INPUT" }),
    );
    const noHunt = (await createVoucherSession({ language: "en" })) as ApiFailure;
    const badField = (await createVoucherSession({ language: "en" })) as ApiFailure;
    expect(isNoHuntAvailable(noHunt)).toBe(true);
    expect(isNoHuntAvailable(badField)).toBe(false);
    expect(badField.code).toBe("INVALID_INPUT");
  });

  it("reports a network failure without throwing", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    expect(await createVoucherSession({ language: "en" })).toEqual({ ok: false, status: 0, code: "NETWORK" });
  });

  it("reports a non-JSON error page by status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
    expect(await createVoucherSession({ language: "en" })).toMatchObject({ ok: false, code: "HTTP_502" });
  });
});

describe("gift success polling", () => {
  it("asks for the session and reads 404 as not yet", async () => {
    const fetch = mockFetch(
      json(404, { error: "Voucher not found for this session", code: "VOUCHER_NOT_FOUND" }),
      json(200, {
        voucher_code: "ABCD-EFGH-JK",
        expires_at: "2027-09-24T10:00:00.000Z",
        redeem_url: "https://cityroam.co.uk/en/redeem?code=ABCD-EFGH-JK",
        language: "en",
      }),
    );
    expect(await fetchVoucherSuccess("cs_test_a&b")).toMatchObject({ ok: false, status: 404, code: "VOUCHER_NOT_FOUND" });
    expect(await fetchVoucherSuccess("cs_test_a&b")).toMatchObject({ ok: true, data: { voucher_code: "ABCD-EFGH-JK" } });
    expect(fetch.mock.calls[0][0]).toMatch(/\/checkout\/voucher-success\?session_id=cs_test_a%26b$/);
  });

  it("backs off up to 5 seconds and gives up after about 30", () => {
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(1)).toBe(1500);
    expect(pollDelay(10)).toBe(5000);
    let elapsed = 0;
    let tries = 1;
    while (elapsed + pollDelay(tries - 1) <= 30_000) elapsed += pollDelay(tries++ - 1);
    expect(tries).toBeGreaterThanOrEqual(8);
    expect(tries).toBeLessThanOrEqual(12);
  });
});

describe("redeeming", () => {
  const voucher = {
    code: "ABCD-EFGH-JK",
    status: "PURCHASED" as const,
    redeemable: true,
    expires_at: "2027-09-24T10:00:00.000Z",
    route_family: null,
  };

  it("looks the code up by its URL-encoded form", async () => {
    const fetch = mockFetch(json(200, voucher));
    expect(await lookupVoucher("ABCD-EFGH-JK")).toEqual({ ok: true, status: 200, data: voucher });
    expect(fetch.mock.calls[0][0]).toMatch(/\/vouchers\/ABCD-EFGH-JK$/);
  });

  it("maps every lookup status to what the page says", () => {
    expect(problemForStatus(voucher)).toBeNull();
    expect(problemForStatus({ ...voucher, status: "REDEEMED", redeemable: false })).toBe("alreadyRedeemed");
    expect(problemForStatus({ ...voucher, status: "EXPIRED", redeemable: false })).toBe("expired");
    expect(problemForStatus({ ...voucher, status: "REFUNDED", redeemable: false })).toBe("refunded");
    expect(problemForStatus({ ...voucher, status: "VOID", redeemable: false })).toBe("void");
    expect(problemForStatus({ ...voucher, redeemable: false })).toBe("expired");
  });

  it("posts JSON to redeem, leaving out a blank email", async () => {
    const created = {
      event_code: "k7m2x9pq",
      event_url: "https://cityroam.co.uk/app/event/k7m2x9pq",
      event_expires_at: "2026-12-23T10:00:00.000Z",
      language: "fr",
      email_sent: false,
    };
    const fetch = mockFetch(json(201, created), json(201, created));

    expect(await redeemVoucher("ABCD-EFGH-JK", { language: "fr", email: "  " })).toEqual({
      ok: true,
      status: 201,
      data: created,
    });
    await redeemVoucher("ABCD-EFGH-JK", { language: "de", email: " sam@example.com " });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/vouchers\/ABCD-EFGH-JK\/redeem$/);
    expect(init.method).toBe("POST");
    // The CSRF guard refuses anything but JSON.
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ language: "fr" });
    const second = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(second[1].body as string)).toEqual({ language: "de", email: "sam@example.com" });
  });

  it.each([
    [400, "INVALID_VOUCHER_CODE", "notACode", false],
    [400, "INVALID_INPUT", "badEmail", false],
    [403, "CSRF_REJECTED", "unavailable", false],
    [404, "VOUCHER_NOT_FOUND", "notFound", false],
    [409, "VOUCHER_ALREADY_REDEEMED", "alreadyRedeemed", true],
    [410, "VOUCHER_EXPIRED", "expired", true],
    [410, "VOUCHER_REFUNDED", "refunded", true],
    [410, "VOUCHER_VOID", "void", true],
    [503, "NO_HUNT_AVAILABLE", "noHunt", false],
    [500, "INTERNAL_ERROR", "unavailable", false],
  ] as const)("%i %s → %s (final: %s)", async (status, code, problem, final) => {
    mockFetch(json(status, { error: "x", code }));
    const result = await redeemVoucher("ABCD-EFGH-JK", { language: "en" });
    expect(result.ok).toBe(false);
    const kind = problemForFailure(result as ApiFailure);
    expect(kind).toBe(problem);
    expect(FINAL_PROBLEMS.has(kind)).toBe(final);
  });

  it("reads Retry-After on a 429", async () => {
    mockFetch(
      json(429, { error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, { "Retry-After": "125" }),
    );
    const result = (await redeemVoucher("ABCD-EFGH-JK", { language: "en" })) as ApiFailure;
    expect(problemForFailure(result)).toBe("rateLimited");
    expect(result.retryAfter).toBe(125);
    expect(retryMinutes(result.retryAfter)).toBe(3);
    expect(retryMinutes(undefined)).toBe(1);
    expect(retryMinutes(5)).toBe(1);
  });
});
