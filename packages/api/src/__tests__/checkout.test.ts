import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ── Mock Stripe ───────────────────────────────────────────────────
const mockStripeCheckoutSessionsCreate = vi.fn();
const mockStripeWebhooksConstructEvent = vi.fn();
vi.mock("stripe", () => {
  const StripeMock = function (this: any) {
    this.checkout = {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    };
    this.webhooks = {
      constructEvent: mockStripeWebhooksConstructEvent,
    };
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

// ── Mock db module ────────────────────────────────────────────────
vi.mock("../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
      routes: { findFirst: vi.fn(), findMany: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    groupBy: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
    offset: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    onConflictDoNothing: vi.fn(() => mockDb),
    returning: vi.fn(() => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    transaction: vi.fn((fn: any) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

// ── Mock Redis index ──────────────────────────────────────────────
vi.mock("../redis/index.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  disconnectRedis: vi.fn(),
  setSession: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn(),
  appendMessage: vi.fn(),
  getMessages: vi.fn().mockResolvedValue([]),
  getMessagesSince: vi.fn().mockResolvedValue([]),
  checkJoinRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 1, limit: 20 }),
  publishControl: vi.fn(),
  publishMessage: vi.fn(),
  publishIncoming: vi.fn(),
  publishTyping: vi.fn(),
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  incomingChannel: vi.fn(),
  messagesChannel: vi.fn(),
  typingChannel: vi.fn(),
  controlChannel: vi.fn(),
  extractEventCode: vi.fn(),
  subscribeToIncomingPattern: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
  checkGuideRateLimit: vi.fn(),
  checkParticipantRateLimit: vi.fn(),
}));

// ── Mock Redis client ─────────────────────────────────────────────
vi.mock("../redis/client.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
  redisSub: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  disconnectRedis: vi.fn(),
}));

import { createTestApp, mockEvent, mockRoute } from "./helpers.js";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { emailRetryPolicy } from "../services/email.js";

/** setup.ts mocks the env module with a plain object, so tests can set keys. */
const testEnv = env as unknown as Record<string, string | undefined>;
function setFamilyMap(value: string | undefined) {
  if (value === undefined) delete testEnv.CHECKOUT_ROUTE_FAMILY_IDS;
  else testEnv.CHECKOUT_ROUTE_FAMILY_IDS = value;
}

// ── Helpers ───────────────────────────────────────────────────────

const FAMILY_A = "11111111-1111-4111-8111-111111111111";
const FAMILY_B = "22222222-2222-4222-8222-222222222222";
const ROUTE_A_EN = "33333333-3333-4333-8333-333333333333";

function makeStripeSessionEvent(
  overrides: Record<string, unknown> = {},
  type = "checkout.session.completed",
): Record<string, unknown> {
  return {
    id: "evt_test_123",
    type,
    data: {
      object: {
        id: "cs_test_session_456",
        payment_intent: "pi_test_789",
        payment_status: "paid",
        customer_details: { email: "buyer@example.com" },
        metadata: {
          route_id: ROUTE_A_EN,
          route_family_id: FAMILY_A,
          route_language: "en",
          requested_language: "en",
        },
        ...overrides,
      },
    },
  };
}

/** Stubs the `insert().values().onConflictDoNothing().returning()` chain. */
function stubInsert(impl: () => Promise<unknown[]>) {
  const returning = vi.fn().mockImplementation(impl);
  vi.mocked((db as any).insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
    }),
  });
  return returning;
}

/** A Postgres unique violation as postgres-js surfaces it. */
function uniqueViolation(constraint: string): Error {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code?: string; constraint_name?: string };
  err.code = "23505";
  err.constraint_name = constraint;
  return err;
}

/** A charge.refunded / charge.dispute.created webhook envelope. */
function makeChargeEvent(
  type: string,
  object: Record<string, unknown>,
): Record<string, unknown> {
  return { id: `evt_${type}`, type, data: { object } };
}

function postWebhook(app: Hono) {
  return app.request("/webhook/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: "raw-body",
  });
}

/** Captures what update().set() was handed, for status assertions. */
function statusUpdates(): Array<Record<string, unknown>> {
  return vi.mocked((db as any).set).mock.calls.map((call: any[]) => call[0]);
}

function lastStripeMetadata(): Record<string, string> {
  const call = mockStripeCheckoutSessionsCreate.mock.calls.at(-1);
  return (call?.[0]?.metadata ?? {}) as Record<string, string>;
}

// ── Tests ─────────────────────────────────────────────────────────

describe("Checkout routes", () => {
  let app: Hono;
  let consoleSpies: Array<{ mockRestore: () => void }>;

  beforeEach(() => {
    vi.clearAllMocks();
    setFamilyMap(undefined);
    app = createTestApp();
    consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
  });

  afterEach(() => {
    for (const spy of consoleSpies) spy.mockRestore();
    setFamilyMap(undefined);
  });

  // ----------------------------------------------------------------
  // POST /checkout/create-session
  // ----------------------------------------------------------------
  describe("POST /checkout/create-session", () => {
    it("pins the requested family and language variant into session metadata", async () => {
      setFamilyMap(JSON.stringify({
        default: FAMILY_A,
        "hen-parties": FAMILY_B,
      }));

      const frRoute = mockRoute({
        id: "44444444-4444-4444-8444-444444444444",
        route_family_id: FAMILY_B,
        language: "fr",
      });
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(frRoute as any);

      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/test",
      });

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: "hen-parties", language: "fr" }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        url: "https://checkout.stripe.com/test",
      });

      expect(lastStripeMetadata()).toMatchObject({
        route_id: frRoute.id,
        route_family_id: FAMILY_B,
        route_language: "fr",
        requested_language: "fr",
        segment: "hen-parties",
      });
      // The route family map must not leak the other segment's family
      expect(lastStripeMetadata().route_family_id).not.toBe(FAMILY_A);
    });

    it("falls back to the English variant inside the same family", async () => {
      setFamilyMap(FAMILY_A);

      const enRoute = mockRoute({
        id: ROUTE_A_EN,
        route_family_id: FAMILY_A,
        language: "en",
      });
      vi.mocked(db.query.routes.findFirst)
        .mockResolvedValueOnce(null as any) // no German variant
        .mockResolvedValueOnce(enRoute as any); // English variant in the family

      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/test",
      });

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: "families", language: "de" }),
      });

      expect(res.status).toBe(200);
      expect(lastStripeMetadata()).toMatchObject({
        route_id: ROUTE_A_EN,
        route_family_id: FAMILY_A,
        route_language: "en",
        requested_language: "de",
      });
    });

    it("uses the only active family when no mapping is configured", async () => {
      vi.mocked(db.query.routes.findMany).mockResolvedValueOnce([
        { route_family_id: FAMILY_A },
        { route_family_id: FAMILY_A },
      ] as any);

      const enRoute = mockRoute({
        id: ROUTE_A_EN,
        route_family_id: FAMILY_A,
        language: "en",
      });
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(enRoute as any);

      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/test",
      });

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: "general", language: "en" }),
      });

      expect(res.status).toBe(200);
      expect(lastStripeMetadata().route_family_id).toBe(FAMILY_A);
    });

    it("returns 400 without creating a Stripe session when the family is ambiguous", async () => {
      vi.mocked(db.query.routes.findMany).mockResolvedValueOnce([
        { route_family_id: FAMILY_A },
        { route_family_id: FAMILY_B },
      ] as any);

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: "general", language: "en" }),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_INPUT");
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("returns 400 when the resolved family has no active route", async () => {
      setFamilyMap(FAMILY_A);
      vi.mocked(db.query.routes.findFirst).mockResolvedValue(null as any);

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: "families", language: "es" }),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_INPUT");
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("rejects a malformed route_family_id", async () => {
      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_family_id: "not-a-uuid" }),
      });

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_INPUT");
      expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("returns 500 when Stripe returns no URL", async () => {
      setFamilyMap(FAMILY_A);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({ url: null });

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: "general", language: "en" }),
      });

      expect(res.status).toBe(500);
      expect((await res.json()).code).toBe("INTERNAL_ERROR");
    });
  });

  // ----------------------------------------------------------------
  // POST /webhook/stripe
  // ----------------------------------------------------------------
  describe("POST /webhook/stripe", () => {
    it("creates event and sends confirmation email on valid webhook", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent(),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );
      stubInsert(async () => [{ id: "event-id", code: "ABCD1234" }]);

      mockResendEmailsSend.mockResolvedValueOnce({ id: "email_123" });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

      expect(mockStripeWebhooksConstructEvent).toHaveBeenCalledWith(
        "raw-body",
        "test-sig",
        "whsec_test_fake",
      );
      expect(mockResendEmailsSend).toHaveBeenCalledOnce();
      expect(mockResendEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "buyer@example.com",
          from: "test@cityroam.com",
          html: expect.stringContaining("ABCD1234"),
        }),
      );
    });

    it("uses the language of the route pinned at checkout for the email", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent({
          metadata: {
            route_id: "55555555-5555-4555-8555-555555555555",
            route_family_id: FAMILY_B,
            route_language: "fr",
            requested_language: "fr",
          },
        }),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({
          id: "55555555-5555-4555-8555-555555555555",
          route_family_id: FAMILY_B,
          language: "fr",
        }) as any,
      );
      stubInsert(async () => [{ id: "event-id", code: "FRFR0001" }]);
      mockResendEmailsSend.mockResolvedValueOnce({ id: "email_fr" });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(mockResendEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("City Roam est réservée"),
        }),
      );
    });

    it("rejects request with invalid webhook signature", async () => {
      mockStripeWebhooksConstructEvent.mockImplementationOnce(() => {
        throw new Error("Invalid signature");
      });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "bad-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_INPUT");
      expect(body.error).toContain("Invalid webhook signature");
    });

    it("rejects request with missing stripe-signature header", async () => {
      const res = await app.request("/webhook/stripe", {
        method: "POST",
        body: "raw-body",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_INPUT");
    });

    it("is idempotent — returns 200 if event already exists for session", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent(),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        mockEvent({ stripe_session_id: "cs_test_session_456" }) as any,
      );

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("treats a concurrent duplicate delivery as a no-op", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent(),
      );

      // Idempotency check misses (the other delivery has not committed yet),
      // then the insert hits the stripe_session_id unique index.
      vi.mocked(db.query.events.findFirst)
        .mockResolvedValueOnce(null as any)
        .mockResolvedValueOnce(
          mockEvent({ stripe_session_id: "cs_test_session_456" }) as any,
        );
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );
      stubInsert(async () => []);

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("retries with a fresh code when the event code collides", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent(),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );

      let attempts = 0;
      const returning = stubInsert(async () => {
        attempts++;
        if (attempts === 1) throw uniqueViolation("events_code_unique");
        return [{ id: "event-id", code: "SECOND01" }];
      });
      mockResendEmailsSend.mockResolvedValueOnce({ id: "email_123" });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(returning).toHaveBeenCalledTimes(2);
      expect(mockResendEmailsSend).toHaveBeenCalledOnce();
      expect(mockResendEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining("SECOND01") }),
      );
    });

    it("returns 500 on a database error that is not a code collision", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent(),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );
      const returning = stubInsert(async () => {
        throw new Error("connection terminated unexpectedly");
      });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Database error" });
      expect(returning).toHaveBeenCalledTimes(1);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("fulfils a fully discounted session that required no payment", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent({ payment_status: "no_payment_required" }),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );
      stubInsert(async () => [{ id: "event-id", code: "FREE0001" }]);
      mockResendEmailsSend.mockResolvedValueOnce({ id: "email_free" });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(db.insert).toHaveBeenCalled();
      expect(mockResendEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining("FREE0001") }),
      );
    });

    it("creates nothing for a session that is not paid", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent({ payment_status: "unpaid" }),
      );

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(db.query.events.findFirst).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("creates the event when a delayed payment later succeeds", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent({}, "checkout.session.async_payment_succeeded"),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
      );
      stubInsert(async () => [{ id: "event-id", code: "LATE0001" }]);
      mockResendEmailsSend.mockResolvedValueOnce({ id: "email_late" });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      expect(mockResendEmailsSend).toHaveBeenCalledOnce();
    });

    it("returns 500 without creating an event when no active route exists", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent(),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValue(null as any);

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "No active route" });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("never leaves the family recorded on the session", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeStripeSessionEvent({
          metadata: { route_family_id: FAMILY_A, route_language: "en" },
        }),
      );

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      // No active route in that family at all.
      vi.mocked(db.query.routes.findFirst).mockResolvedValue(null as any);

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(500);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // GET /checkout/success
  // ----------------------------------------------------------------
  describe("GET /checkout/success", () => {
    it("returns event code and URL for valid session_id", async () => {
      const event = mockEvent({
        code: "XYZW5678",
        stripe_session_id: "cs_test_success",
      });
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        event as any,
      );

      const res = await app.request(
        "/checkout/success?session_id=cs_test_success",
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.event_code).toBe("XYZW5678");
      expect(body.event_url).toContain("XYZW5678");
    });

    it("returns 404 for unknown session_id", async () => {
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);

      const res = await app.request(
        "/checkout/success?session_id=cs_unknown",
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("EVENT_NOT_FOUND");
    });

    it("returns 400 when session_id parameter is missing", async () => {
      const res = await app.request("/checkout/success");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_INPUT");
    });
  });

  // ----------------------------------------------------------------
  // Refunds and disputes raised outside the admin panel
  // ----------------------------------------------------------------
  describe("POST /webhook/stripe — charge.refunded", () => {
    const FULL_CHARGE = {
      id: "ch_test_1",
      payment_intent: "pi_test_789",
      amount: 4900,
      amount_refunded: 4900,
      refunded: true,
    };

    it("marks the event REFUNDED for a full dashboard refund", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.refunded", FULL_CHARGE),
      );
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        mockEvent({ id: "event-id", status: "IN_PROGRESS" }) as any,
      );

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(statusUpdates()).toContainEqual({ status: "REFUNDED" });
    });

    it("is a no-op when the event is already REFUNDED", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.refunded", FULL_CHARGE),
      );
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        mockEvent({ id: "event-id", status: "REFUNDED" }) as any,
      );

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(vi.mocked((db as any).update)).not.toHaveBeenCalled();
    });

    it("ignores a partial refund", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.refunded", {
          ...FULL_CHARGE,
          amount_refunded: 1000,
          refunded: false,
        }),
      );

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(vi.mocked(db.query.events.findFirst)).not.toHaveBeenCalled();
      expect(vi.mocked((db as any).update)).not.toHaveBeenCalled();
    });

    it("acknowledges a charge with no matching event", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.refunded", FULL_CHARGE),
      );
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(vi.mocked((db as any).update)).not.toHaveBeenCalled();
    });

    it("resolves an expanded payment_intent object", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.refunded", {
          ...FULL_CHARGE,
          payment_intent: { id: "pi_test_789" },
        }),
      );
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        mockEvent({ id: "event-id", status: "IN_PROGRESS" }) as any,
      );

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(statusUpdates()).toContainEqual({ status: "REFUNDED" });
    });
  });

  describe("POST /webhook/stripe — charge.dispute.created", () => {
    it("marks the event REFUNDED when a dispute is opened", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.dispute.created", {
          id: "dp_test_1",
          charge: "ch_test_1",
          payment_intent: "pi_test_789",
        }),
      );
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        mockEvent({ id: "event-id", status: "IN_PROGRESS" }) as any,
      );

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(statusUpdates()).toContainEqual({ status: "REFUNDED" });
    });

    it("acknowledges a dispute with no payment intent", async () => {
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(
        makeChargeEvent("charge.dispute.created", {
          id: "dp_test_2",
          charge: "ch_test_2",
          payment_intent: null,
        }),
      );

      const res = await postWebhook(app);

      expect(res.status).toBe(200);
      expect(vi.mocked(db.query.events.findFirst)).not.toHaveBeenCalled();
    });
  });
});

// ── Confirmation email delivery ───────────────────────────────────
describe("confirmation email delivery", () => {
  let app: Hono;
  const originalBackoff = emailRetryPolicy.backoffMs;

  beforeEach(() => {
    vi.clearAllMocks();
    setFamilyMap(undefined);
    // The waits are the one thing not worth reproducing in a unit test.
    emailRetryPolicy.backoffMs = [0, 0];
    app = createTestApp();
  });

  afterEach(() => {
    emailRetryPolicy.backoffMs = originalBackoff;
  });

  function stubPaidSession() {
    mockStripeWebhooksConstructEvent.mockReturnValueOnce(makeStripeSessionEvent());
    vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
    vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
      mockRoute({ id: ROUTE_A_EN, route_family_id: FAMILY_A }) as any,
    );
    stubInsert(async () => [{ id: "event-id", code: "ABCD1234" }]);
  }

  it("retries a failed send before giving up", async () => {
    stubPaidSession();
    mockResendEmailsSend
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ data: { id: "email_2" } });

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
  });

  it("still returns 200 when every attempt fails, and flags the event", async () => {
    stubPaidSession();
    mockResendEmailsSend.mockRejectedValue(new Error("resend is down"));

    const res = await postWebhook(app);

    // The event exists and the buyer has paid. A 500 here would only make
    // Stripe repeat the same failing send.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(emailRetryPolicy.maxAttempts);

    expect(statusUpdates()).toContainEqual(
      expect.objectContaining({ code_email_failed_at: expect.any(Date) }),
    );
  });

  it("records a successful send against the new event", async () => {
    stubPaidSession();
    mockResendEmailsSend.mockResolvedValueOnce({ data: { id: "email_1" } });

    await postWebhook(app);

    expect(statusUpdates()).toContainEqual(
      expect.objectContaining({
        code_email_sent_at: expect.any(Date),
        code_email_failed_at: null,
      }),
    );
  });
});
