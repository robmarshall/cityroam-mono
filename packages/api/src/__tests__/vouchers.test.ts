import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";

// ── Mock Stripe ───────────────────────────────────────────────────
const mockStripeCheckoutSessionsCreate = vi.fn();
const mockStripeWebhooksConstructEvent = vi.fn();
vi.mock("stripe", () => {
  const StripeMock = function (this: any) {
    this.checkout = { sessions: { create: mockStripeCheckoutSessionsCreate } };
    this.webhooks = { constructEvent: mockStripeWebhooksConstructEvent };
  } as any;
  return { default: StripeMock };
});

// ── Mock Resend ───────────────────────────────────────────────────
const mockResendEmailsSend = vi.fn();
vi.mock("resend", () => {
  const ResendMock = function (this: any) {
    this.emails = { send: mockResendEmailsSend };
  } as any;
  return { Resend: ResendMock };
});

// ── Stateful fake db ──────────────────────────────────────────────
// Just enough of drizzle's builder to run the voucher code paths. Each
// builder chain is synchronous up to `.returning()`, so the "current chain"
// is never interleaved even when two requests run concurrently; the voucher
// status compare-and-swap is emulated against `state.voucher`, which is what
// Postgres's row lock + WHERE re-check guarantees for real.
const fake = vi.hoisted(() => {
  const state: {
    voucher: any | null;
    insertedEvents: any[];
    insertedVouchers: any[];
    sets: Array<{ table: unknown; values: any }>;
    /** Force the next voucher insert to hit the session conflict. */
    sessionConflict: boolean;
    /** Unique-violation errors to throw from the next voucher inserts. */
    voucherInsertErrors: Error[];
    tables: { vouchers?: unknown; events?: unknown };
  } = {
    voucher: null,
    insertedEvents: [],
    insertedVouchers: [],
    sets: [],
    sessionConflict: false,
    voucherInsertErrors: [],
    tables: {},
  };
  return { state };
});

vi.mock("../db/index.js", () => {
  const { state } = fake;
  let ctx: { op: string; table?: unknown; set?: any; values?: any } = { op: "none" };

  function handleReturning(): any[] {
    const { vouchers, events } = state.tables;
    if (ctx.op === "update" && ctx.table === vouchers && state.voucher) {
      const v = state.voucher;
      const next = ctx.set?.status;
      const now = Date.now();
      if (next === "REDEEMED") {
        if (v.status === "PURCHASED" && v.expires_at.getTime() > now) {
          Object.assign(v, ctx.set);
          return [{ id: v.id }];
        }
        return [];
      }
      if (next === "REFUNDED") {
        if (["PURCHASED", "EXPIRED", "VOID"].includes(v.status)) {
          Object.assign(v, ctx.set);
          return [{ id: v.id }];
        }
        return [];
      }
      if (next === "VOID") {
        if (["PURCHASED", "EXPIRED"].includes(v.status)) {
          Object.assign(v, ctx.set);
          return [{ ...v }];
        }
        return [];
      }
      return [];
    }
    if (ctx.op === "insert" && ctx.table === events) {
      const row = { id: `evt-${state.insertedEvents.length + 1}`, code: ctx.values.code };
      state.insertedEvents.push({ ...ctx.values, id: row.id });
      return [row];
    }
    if (ctx.op === "insert" && ctx.table === vouchers) {
      const err = state.voucherInsertErrors.shift();
      if (err) throw err;
      if (state.sessionConflict) return [];
      const row = { id: `vch-${state.insertedVouchers.length + 1}`, ...ctx.values };
      state.insertedVouchers.push(row);
      return [row];
    }
    return [];
  }

  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([]),
    query: {
      vouchers: { findFirst: vi.fn(async () => (state.voucher ? { ...state.voucher } : null)) },
      events: { findFirst: vi.fn(async () => null) },
      routes: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
      routeFamilies: { findFirst: vi.fn(async () => null) },
      adminApiKeys: { findFirst: vi.fn(async () => null) },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
    offset: vi.fn(async () => []),
    groupBy: vi.fn(() => mockDb),
    insert: vi.fn((table: unknown) => {
      ctx = { op: "insert", table };
      return mockDb;
    }),
    values: vi.fn((values: any) => {
      ctx.values = values;
      return mockDb;
    }),
    onConflictDoNothing: vi.fn(() => mockDb),
    update: vi.fn((table: unknown) => {
      ctx = { op: "update", table };
      return mockDb;
    }),
    set: vi.fn((values: any) => {
      ctx.set = values;
      state.sets.push({ table: ctx.table, values });
      return mockDb;
    }),
    returning: vi.fn(async () => handleReturning()),
    delete: vi.fn(() => mockDb),
    // The transaction body runs against the same fake; the compare-and-swap in
    // handleReturning is what decides a race.
    transaction: vi.fn(async (fn: (tx: any) => unknown) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

import { createTestApp, adminRequest, jsonRequest, createTestApiKey, apiKeyRequest, mockRoute } from "./helpers.js";
import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { vouchers, events } from "../db/schema/index.js";
import { emailRetryPolicy } from "../services/email.js";
import { VOUCHER_REDEEM_LIMIT } from "../redis/rate-limit.js";
import { VOUCHER_CODE_ALPHABET } from "@cityroam/shared/constants";

fake.state.tables = { vouchers, events };
const mockedDb = db as any;
const state = fake.state;

const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const ROUTE_A_EN = "33333333-3333-4333-8333-333333333333";
const ROUTE_A_FR = "44444444-4444-4444-8444-444444444444";
const MARKETING = "https://marketing.test.com";
const CODE = "ABCD-EFGH-JK";

function futureMonths(n: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

function voucherRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "vch-existing",
    code: CODE,
    status: "PURCHASED",
    purchaser_email: "giver@example.com",
    recipient_name: "Sam",
    message: "Happy birthday",
    language: "en",
    route_family_id: FAMILY_A,
    amount_total: 4500,
    currency: "gbp",
    stripe_session_id: "cs_voucher_1",
    stripe_payment_id: "pi_voucher_1",
    created_at: new Date(),
    expires_at: futureMonths(12),
    redeemed_at: null,
    redeemed_event_id: null,
    refunded_at: null,
    voided_at: null,
    void_reason: null,
    email_sent_at: null,
    email_failed_at: null,
    email_error: null,
    ...overrides,
  };
}

function resetState() {
  state.voucher = null;
  state.insertedEvents = [];
  state.insertedVouchers = [];
  state.sets = [];
  state.sessionConflict = false;
  state.voucherInsertErrors = [];
}

function voucherSessionEvent(overrides: Record<string, unknown> = {}, type = "checkout.session.completed") {
  return {
    id: "evt_v",
    type,
    data: {
      object: {
        id: "cs_voucher_1",
        payment_intent: "pi_voucher_1",
        payment_status: "paid",
        amount_total: 4500,
        currency: "gbp",
        customer_details: { email: "giver@example.com" },
        metadata: {
          kind: "voucher",
          language: "fr",
          route_family_id: FAMILY_A,
          recipient_name: "Sam",
          message: "Joyeux anniversaire",
        },
        ...overrides,
      },
    },
  };
}

function postWebhook(app: Hono) {
  return app.request("/webhook/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: "raw",
  });
}

function redeem(app: Hono, code: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return jsonRequest(app, "POST", `/vouchers/${code}/redeem`, body, { Origin: MARKETING, ...headers });
}

function sentEmails(): Array<{ to: string; subject: string; html: string }> {
  return mockResendEmailsSend.mock.calls.map((c: any[]) => c[0]);
}

describe("gift vouchers", () => {
  let app: Hono;
  const originalBackoff = emailRetryPolicy.backoffMs;

  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    emailRetryPolicy.backoffMs = [0, 0];
    app = createTestApp();
    mockResendEmailsSend.mockResolvedValue({ data: { id: "email_1" } });
    (redis as any).eval.mockResolvedValue(1);
    mockedDb.query.routes.findFirst.mockResolvedValue(
      mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A, language: "en" }),
    );
    mockedDb.query.routes.findMany.mockResolvedValue([{ route_family_id: FAMILY_A }]);
    mockedDb.query.routeFamilies.findFirst.mockResolvedValue({ id: FAMILY_A, name: "Leeds Classic", city: "Leeds" });
    mockedDb.query.events.findFirst.mockResolvedValue(null);
    for (const spy of ["log", "warn", "error"] as const) {
      vi.spyOn(console, spy).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    emailRetryPolicy.backoffMs = originalBackoff;
    vi.restoreAllMocks();
  });

  // ── Purchase ──────────────────────────────────────────────────
  describe("POST /checkout/create-voucher-session", () => {
    it("creates a Stripe session tagged as a voucher at the game price", async () => {
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({ url: "https://stripe.test/session" });

      const res = await jsonRequest(app, "POST", "/checkout/create-voucher-session", {
        language: "de",
        route_family_id: FAMILY_A,
        recipient_name: "  Sam  ",
        message: "Line one\nLine two",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: "https://stripe.test/session" });
      const args = mockStripeCheckoutSessionsCreate.mock.calls[0][0];
      expect(args.line_items).toEqual([{ price: "price_test_fake", quantity: 1 }]);
      expect(args.metadata).toEqual({
        kind: "voucher",
        language: "de",
        route_family_id: FAMILY_A,
        recipient_name: "Sam",
        message: "Line one\nLine two",
      });
      expect(args.payment_intent_data).toEqual({ metadata: { kind: "voucher" } });
      expect(args.success_url).toBe(`${MARKETING}/de/gift/success?session_id={CHECKOUT_SESSION_ID}`);
      expect(args.cancel_url).toBe(`${MARKETING}/de/gift`);
    });

    it("defaults to English and any family", async () => {
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({ url: "https://stripe.test/s" });
      const res = await jsonRequest(app, "POST", "/checkout/create-voucher-session", {});
      expect(res.status).toBe(200);
      expect(mockStripeCheckoutSessionsCreate.mock.calls[0][0].metadata).toEqual({
        kind: "voucher",
        language: "en",
        route_family_id: "",
      });
    });

    it("rejects an over-long recipient name or message before Stripe", async () => {
      const long = await jsonRequest(app, "POST", "/checkout/create-voucher-session", {
        recipient_name: "x".repeat(61),
      });
      expect(long.status).toBe(400);
      const msg = await jsonRequest(app, "POST", "/checkout/create-voucher-session", {
        message: "y".repeat(301),
      });
      expect(msg.status).toBe(400);
      const multiLineName = await jsonRequest(app, "POST", "/checkout/create-voucher-session", {
        recipient_name: "Sam\nSmith",
      });
      expect(multiLineName.status).toBe(400);
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses a family with no sellable hunt", async () => {
      mockedDb.query.routes.findFirst.mockResolvedValue(null);
      const res = await jsonRequest(app, "POST", "/checkout/create-voucher-session", {
        route_family_id: FAMILY_A,
      });
      expect(res.status).toBe(400);
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("rejects an unsupported language", async () => {
      const res = await jsonRequest(app, "POST", "/checkout/create-voucher-session", { language: "it" });
      expect(res.status).toBe(400);
    });
  });

  // ── Webhook: creation ─────────────────────────────────────────
  describe("webhook: voucher sessions", () => {
    it("creates a voucher, not an event, and emails the buyer in their language", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent());

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(state.insertedEvents).toHaveLength(0);
      expect(state.insertedVouchers).toHaveLength(1);
      const v = state.insertedVouchers[0];
      expect(v.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
      expect(v).toMatchObject({
        status: "PURCHASED",
        purchaser_email: "giver@example.com",
        recipient_name: "Sam",
        message: "Joyeux anniversaire",
        language: "fr",
        route_family_id: FAMILY_A,
        amount_total: 4500,
        currency: "gbp",
        stripe_session_id: "cs_voucher_1",
        stripe_payment_id: "pi_voucher_1",
      });
      // 12 calendar months after purchase.
      const expected = new Date(v.created_at);
      expected.setUTCMonth(expected.getUTCMonth() + 12);
      expect(v.expires_at.getTime()).toBe(expected.getTime());

      const [email] = sentEmails();
      expect(email.to).toBe("giver@example.com");
      expect(email.subject).toBe("Votre bon cadeau City Roam");
      expect(email.html).toContain(v.code);
      expect(email.html).toContain(`${MARKETING}/fr/redeem?code=${v.code}`);
      expect(email.html).toContain("guidés par le Hibou");
      expect(state.sets).toContainEqual(
        expect.objectContaining({ table: vouchers, values: expect.objectContaining({ email_sent_at: expect.any(Date) }) }),
      );
    });

    it("also fulfils on async_payment_succeeded", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        voucherSessionEvent({}, "checkout.session.async_payment_succeeded"),
      );
      const res = await postWebhook(app);
      expect(res.status).toBe(200);
      expect(state.insertedVouchers).toHaveLength(1);
    });

    it("ignores an unpaid session", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent({ payment_status: "unpaid" }));
      const res = await postWebhook(app);
      expect(res.status).toBe(200);
      expect(state.insertedVouchers).toHaveLength(0);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("is idempotent: a redelivered webhook finds the voucher and does nothing", async () => {
      state.voucher = voucherRow();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent());

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(mockedDb.insert).not.toHaveBeenCalled();
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("a concurrent delivery that loses the session conflict sends no second email", async () => {
      state.sessionConflict = true;
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent());
      mockedDb.query.vouchers.findFirst
        .mockResolvedValueOnce(null) // fast-path check
        .mockResolvedValueOnce(voucherRow()); // after the conflict

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("retries a voucher code collision with a fresh code", async () => {
      const collision = Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "vouchers_code_unique",
      });
      state.voucherInsertErrors = [collision];
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent());

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(mockedDb.insert).toHaveBeenCalledTimes(2);
      expect(state.insertedVouchers).toHaveLength(1);
    });

    it("answers 500 on a database failure so Stripe retries", async () => {
      state.voucherInsertErrors = [new Error("connection reset")];
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent());
      const res = await postWebhook(app);
      expect(res.status).toBe(500);
    });

    it("still answers 200 when the voucher email fails, and flags it", async () => {
      mockResendEmailsSend.mockRejectedValue(new Error("resend down"));
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(voucherSessionEvent());

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(mockResendEmailsSend).toHaveBeenCalledTimes(emailRetryPolicy.maxAttempts);
      expect(state.sets).toContainEqual(
        expect.objectContaining({ values: expect.objectContaining({ email_failed_at: expect.any(Date) }) }),
      );
    });

    it("GET /checkout/voucher-success returns the code once the webhook has landed", async () => {
      state.voucher = voucherRow({ language: "nl" });
      const res = await app.request("/checkout/voucher-success?session_id=cs_voucher_1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        voucher_code: CODE,
        redeem_url: `${MARKETING}/nl/redeem?code=${CODE}`,
        language: "nl",
      });

      state.voucher = null;
      const pending = await app.request("/checkout/voucher-success?session_id=cs_other");
      expect(pending.status).toBe(404);
      expect((await pending.json()).code).toBe("VOUCHER_NOT_FOUND");
    });
  });

  // ── Webhook: refunds ──────────────────────────────────────────
  describe("webhook: refunds and disputes", () => {
    function chargeRefunded(amountRefunded = 4500) {
      return {
        id: "evt_r",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_1",
            payment_intent: "pi_voucher_1",
            amount: 4500,
            amount_refunded: amountRefunded,
          },
        },
      };
    }

    it("marks an unredeemed voucher REFUNDED and touches no event", async () => {
      state.voucher = voucherRow();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(chargeRefunded());

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(state.voucher.status).toBe("REFUNDED");
      expect(state.voucher.refunded_at).toBeInstanceOf(Date);
      expect(state.sets.filter((s) => s.table === events)).toHaveLength(0);
    });

    it("refunds an expired voucher too", async () => {
      state.voucher = voucherRow({ status: "EXPIRED" });
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(chargeRefunded());
      await postWebhook(app);
      expect(state.voucher.status).toBe("REFUNDED");
    });

    it("is a no-op for an already refunded voucher", async () => {
      state.voucher = voucherRow({ status: "REFUNDED" });
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(chargeRefunded());
      const res = await postWebhook(app);
      expect(res.status).toBe(200);
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it("leaves a redeemed voucher REDEEMED and refunds its event instead", async () => {
      state.voucher = voucherRow({ status: "REDEEMED", redeemed_event_id: "evt-redeemed" });
      mockedDb.query.events.findFirst.mockResolvedValue({
        id: "evt-redeemed",
        code: "abcd2345",
        status: "NOT_STARTED",
        stripe_payment_id: "pi_voucher_1",
      });
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(chargeRefunded());

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(state.voucher.status).toBe("REDEEMED");
      expect(state.sets).toContainEqual({ table: events, values: { status: "REFUNDED" } });
    });

    it("ignores a partial refund", async () => {
      state.voucher = voucherRow();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(chargeRefunded(1000));
      await postWebhook(app);
      expect(state.voucher.status).toBe("PURCHASED");
    });

    it("treats a dispute on an unredeemed voucher like a refund", async () => {
      state.voucher = voucherRow();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce({
        id: "evt_d",
        type: "charge.dispute.created",
        data: { object: { id: "dp_1", payment_intent: "pi_voucher_1" } },
      });
      await postWebhook(app);
      expect(state.voucher.status).toBe("REFUNDED");
    });
  });

  // ── Lookup ────────────────────────────────────────────────────
  describe("GET /vouchers/:code", () => {
    it("returns status, expiry and family with no personal data", async () => {
      state.voucher = voucherRow();
      const res = await app.request(`/vouchers/${CODE}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        code: CODE,
        status: "PURCHASED",
        redeemable: true,
        expires_at: state.voucher.expires_at.toISOString(),
        route_family: { id: FAMILY_A, name: "Leeds Classic", city: "Leeds" },
      });
      const text = JSON.stringify(body);
      expect(text).not.toContain("giver@example.com");
      expect(text).not.toContain("Sam");
      expect(text).not.toContain("birthday");
    });

    it("forgives case, spaces and missing dashes", async () => {
      state.voucher = voucherRow();
      const res = await app.request("/vouchers/abcd%20efgh%20jk");
      expect(res.status).toBe(200);
      expect((await res.json()).code).toBe(CODE);
    });

    it("reports a PURCHASED voucher past its date as expired", async () => {
      state.voucher = voucherRow({ expires_at: new Date(Date.now() - 1000) });
      const body = await (await app.request(`/vouchers/${CODE}`)).json();
      expect(body.status).toBe("EXPIRED");
      expect(body.redeemable).toBe(false);
    });

    it("404s an unknown code and 400s a malformed one", async () => {
      const unknown = await app.request(`/vouchers/${CODE}`);
      expect(unknown.status).toBe(404);
      expect((await unknown.json()).code).toBe("VOUCHER_NOT_FOUND");

      const malformed = await app.request("/vouchers/ABCD-EFGH-J0");
      expect(malformed.status).toBe(400);
      expect((await malformed.json()).code).toBe("INVALID_VOUCHER_CODE");
    });

    it("rate limits per IP", async () => {
      (redis as any).eval.mockResolvedValueOnce([31, 42]);
      const res = await app.request(`/vouchers/${CODE}`, { headers: { "x-real-ip": "203.0.113.9" } });
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("42");
      expect((await res.json()).code).toBe("RATE_LIMITED");
      expect((redis as any).eval.mock.calls[0][2]).toBe("ratelimit:voucher-lookup:203.0.113.9");
    });
  });

  // ── Redemption ────────────────────────────────────────────────
  describe("POST /vouchers/:code/redeem", () => {
    it("creates the event like a purchase: fresh code, NOT_STARTED, 90 days from now", async () => {
      state.voucher = voucherRow();
      const before = Date.now();

      const res = await redeem(app, CODE, {});

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(state.insertedEvents).toHaveLength(1);
      const ev = state.insertedEvents[0];
      expect(ev).toMatchObject({
        status: "NOT_STARTED",
        route_id: ROUTE_A_EN,
        route_family_id: FAMILY_A,
        language: "en",
        stripe_payment_id: "pi_voucher_1",
        buyer_email: null,
      });
      expect(ev.code).toMatch(/^[a-z2-9]{8}$/);
      const days = (ev.expires_at.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThan(90.1);

      expect(body).toEqual({
        event_code: ev.code,
        event_url: `https://app.test.com/app/event/${ev.code}`,
        event_expires_at: ev.expires_at.toISOString(),
        language: "en",
        email_sent: false,
      });
      expect(state.voucher.status).toBe("REDEEMED");
      expect(state.voucher.redeemed_at).toBeInstanceOf(Date);
      expect(state.voucher.redeemed_event_id ?? state.sets.find((s) => s.values.redeemed_event_id)?.values.redeemed_event_id).toBe(ev.id);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("emails the redeemer in their language with the gift footer", async () => {
      state.voucher = voucherRow();
      mockedDb.query.routes.findFirst.mockResolvedValue(
        mockRoute({ id: ROUTE_A_FR, route_family_id: FAMILY_A, language: "fr" }),
      );

      const res = await redeem(app, CODE, { language: "fr", email: "friend@example.com" });

      expect(res.status).toBe(201);
      expect((await res.json()).email_sent).toBe(true);
      expect(state.insertedEvents[0].buyer_email).toBe("friend@example.com");
      const [email] = sentEmails();
      expect(email.to).toBe("friend@example.com");
      expect(email.subject).toBe("Votre partie City Roam est réservée");
      expect(email.html).toContain("Cette partie est un cadeau.");
      expect(email.html).not.toContain("remboursement complet");
    });

    it("only one of two concurrent redemptions succeeds", async () => {
      state.voucher = voucherRow();

      const [a, b] = await Promise.all([redeem(app, CODE), redeem(app, CODE)]);
      const statuses = [a.status, b.status].sort();

      expect(statuses).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expect((await loser.json()).code).toBe("VOUCHER_ALREADY_REDEEMED");
      expect(state.insertedEvents).toHaveLength(1);
    });

    it("a redemption that passes the pre-check but loses the compare-and-swap is refused", async () => {
      // Another request claimed the voucher between this one's read and its
      // UPDATE: the read still says PURCHASED, the row now says REDEEMED.
      state.voucher = voucherRow({ status: "REDEEMED", redeemed_event_id: "evt-other" });
      mockedDb.query.vouchers.findFirst.mockResolvedValueOnce(voucherRow());

      const res = await redeem(app, CODE);

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("VOUCHER_ALREADY_REDEEMED");
      expect(state.insertedEvents).toHaveLength(0);
      expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["REDEEMED", 409, "VOUCHER_ALREADY_REDEEMED"],
      ["REFUNDED", 410, "VOUCHER_REFUNDED"],
      ["VOID", 410, "VOUCHER_VOID"],
      ["EXPIRED", 410, "VOUCHER_EXPIRED"],
    ])("refuses a %s voucher with %i %s", async (status, http, code) => {
      state.voucher = voucherRow({ status });
      const res = await redeem(app, CODE);
      expect(res.status).toBe(http);
      expect((await res.json()).code).toBe(code);
      expect(state.insertedEvents).toHaveLength(0);
    });

    it("refuses a PURCHASED voucher past its expiry before the sweep has run", async () => {
      state.voucher = voucherRow({ expires_at: new Date(Date.now() - 60_000) });
      const res = await redeem(app, CODE);
      expect(res.status).toBe(410);
      expect((await res.json()).code).toBe("VOUCHER_EXPIRED");
    });

    it("404s an unknown code", async () => {
      const res = await redeem(app, CODE);
      expect(res.status).toBe(404);
    });

    it("answers 503 when no hunt is available and leaves the voucher unredeemed", async () => {
      state.voucher = voucherRow();
      mockedDb.query.routes.findFirst.mockResolvedValue(null);
      const res = await redeem(app, CODE);
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("NO_HUNT_AVAILABLE");
      expect(state.voucher.status).toBe("PURCHASED");
    });

    it("lets an any-family voucher pick its family", async () => {
      state.voucher = voucherRow({ route_family_id: null });
      const other = "55555555-5555-4555-8555-555555555555";
      mockedDb.query.routes.findFirst.mockResolvedValue(
        mockRoute({ id: ROUTE_A_EN, route_family_id: other, language: "en" }),
      );
      const res = await redeem(app, CODE, { route_family_id: other });
      expect(res.status).toBe(201);
      expect(state.insertedEvents[0].route_family_id).toBe(other);
    });

    it("rejects a cross-site origin and a form post (CSRF)", async () => {
      state.voucher = voucherRow();
      const foreign = await redeem(app, CODE, {}, { Origin: "https://evil.example" });
      expect(foreign.status).toBe(403);
      expect((await foreign.json()).code).toBe("CSRF_REJECTED");

      const form = await app.request(`/vouchers/${CODE}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: MARKETING },
        body: "email=x@example.com",
      });
      expect(form.status).toBe(403);
      expect(state.voucher.status).toBe("PURCHASED");
    });

    it("rate limits per IP before touching the voucher", async () => {
      state.voucher = voucherRow();
      (redis as any).eval.mockResolvedValueOnce([VOUCHER_REDEEM_LIMIT + 1, 600]);
      const res = await redeem(app, CODE, {}, { "x-real-ip": "198.51.100.4" });
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("600");
      expect((redis as any).eval.mock.calls[0][2]).toBe("ratelimit:voucher-redeem:198.51.100.4");
      expect(mockedDb.query.vouchers.findFirst).not.toHaveBeenCalled();
    });

    it("rejects an invalid email", async () => {
      state.voucher = voucherRow();
      const res = await redeem(app, CODE, { email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(state.voucher.status).toBe("PURCHASED");
    });
  });

  // ── Admin ─────────────────────────────────────────────────────
  describe("admin voucher endpoints", () => {
    const ID = "0e0e0e0e-0000-4000-8000-000000000001";

    it("are session-only: API keys get 403 and anonymous callers 401", async () => {
      const key = createTestApiKey([
        "routes:read",
        "routes:write",
        "images:read",
        "images:write",
        "message-banks:read",
        "message-banks:write",
      ]);
      for (const [method, path] of [
        ["GET", "/admin/vouchers"],
        ["GET", `/admin/vouchers/${ID}`],
        ["POST", `/admin/vouchers/${ID}/void`],
        ["POST", `/admin/vouchers/${ID}/resend-email`],
      ] as const) {
        const withKey = await apiKeyRequest(app, key.token, method, path, method === "POST" ? {} : undefined);
        expect(withKey.status, `${method} ${path}`).toBe(403);
        expect((await withKey.json()).code).toBe("ADMIN_SESSION_REQUIRED");

        const anon = await jsonRequest(app, method, path);
        expect(anon.status, `${method} ${path}`).toBe(401);
      }
    });

    it("lists vouchers with a status filter and code search", async () => {
      const row = voucherRow({ id: ID });
      mockedDb.where.mockReturnValueOnce(Promise.resolve([{ count: 1 }]));
      mockedDb.offset.mockResolvedValueOnce([row]);

      const res = await adminRequest(app, "GET", "/admin/vouchers?status=PURCHASED&q=abcd efgh jk");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
      expect(body.vouchers[0]).toMatchObject({ id: ID, code: CODE, status: "PURCHASED", purchaser_email: "giver@example.com" });
    });

    it("rejects an unknown status filter", async () => {
      const res = await adminRequest(app, "GET", "/admin/vouchers?status=BOGUS");
      expect(res.status).toBe(400);
    });

    it("shows the detail with the redemption link", async () => {
      state.voucher = voucherRow({ id: ID });
      const res = await adminRequest(app, "GET", `/admin/vouchers/${ID}`);
      expect(res.status).toBe(200);
      const { voucher } = await res.json();
      expect(voucher).toMatchObject({
        id: ID,
        message: "Happy birthday",
        route_family: { id: FAMILY_A, name: "Leeds Classic" },
        redeem_url: `${MARKETING}/en/redeem?code=${CODE}`,
      });
    });

    it("voids an unredeemed voucher, which can then not be redeemed", async () => {
      state.voucher = voucherRow({ id: ID });
      const res = await adminRequest(app, "POST", `/admin/vouchers/${ID}/void`, { reason: "Duplicate purchase" });
      expect(res.status).toBe(200);
      expect(state.voucher.status).toBe("VOID");
      expect(state.voucher.void_reason).toBe("Duplicate purchase");

      const after = await redeem(app, CODE);
      expect(after.status).toBe(410);
      expect((await after.json()).code).toBe("VOUCHER_VOID");
    });

    it("refuses to void a redeemed voucher", async () => {
      state.voucher = voucherRow({ id: ID, status: "REDEEMED" });
      const res = await adminRequest(app, "POST", `/admin/vouchers/${ID}/void`, {});
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("VOUCHER_NOT_VOIDABLE");
    });

    it("resends the voucher email in the voucher's language", async () => {
      state.voucher = voucherRow({ id: ID, language: "es" });
      const res = await adminRequest(app, "POST", `/admin/vouchers/${ID}/resend-email`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, attempts: 1 });
      expect(sentEmails()[0].subject).toBe("Tu vale regalo de City Roam");
    });

    it("refuses to resend a redeemed voucher and reports a failed send", async () => {
      state.voucher = voucherRow({ id: ID, status: "REDEEMED" });
      const redeemed = await adminRequest(app, "POST", `/admin/vouchers/${ID}/resend-email`);
      expect(redeemed.status).toBe(409);

      state.voucher = voucherRow({ id: ID });
      mockResendEmailsSend.mockRejectedValue(new Error("resend down"));
      const failed = await adminRequest(app, "POST", `/admin/vouchers/${ID}/resend-email`);
      expect(failed.status).toBe(502);
      expect((await failed.json()).code).toBe("EMAIL_SEND_FAILED");
    });

    it("404s a malformed or unknown id", async () => {
      const res = await adminRequest(app, "GET", "/admin/vouchers/not-a-uuid");
      expect(res.status).toBe(404);
    });
  });
});

describe("voucher code alphabet sanity", () => {
  it("has no ambiguous characters", () => {
    for (const ch of "01OIL") expect(VOUCHER_CODE_ALPHABET).not.toContain(ch);
  });
});
