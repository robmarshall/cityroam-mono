import { vi, describe, it, expect, beforeEach } from "vitest";
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
      participants: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
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

// ── Helpers ───────────────────────────────────────────────────────

function makeStripeSessionEvent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "evt_test_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_session_456",
        payment_intent: "pi_test_789",
        customer_details: { email: "buyer@example.com" },
        ...overrides,
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("Checkout routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // ----------------------------------------------------------------
  // POST /checkout/create-session
  // ----------------------------------------------------------------
  describe("POST /checkout/create-session", () => {
    it("returns Stripe checkout session URL", async () => {
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/test",
      });

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ url: "https://checkout.stripe.com/test" });
      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledOnce();
    });

    it("returns 500 when Stripe returns no URL", async () => {
      mockStripeCheckoutSessionsCreate.mockResolvedValueOnce({ url: null });

      const res = await app.request("/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe("INTERNAL_ERROR");
    });
  });

  // ----------------------------------------------------------------
  // POST /webhook/stripe
  // ----------------------------------------------------------------
  describe("POST /webhook/stripe", () => {
    it("creates event and sends confirmation email on valid webhook", async () => {
      const stripeEvent = makeStripeSessionEvent();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(stripeEvent);

      // First findFirst call: idempotency check -> no existing event
      // Second findFirst call: code collision check -> no collision
      vi.mocked(db.query.events.findFirst)
        .mockResolvedValueOnce(null as any) // idempotency
        .mockResolvedValueOnce(null as any); // code collision

      // Active route exists
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(
        mockRoute() as any,
      );

      // Insert chain returns (not used but the chain must resolve)
      vi.mocked((db as any).insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockResendEmailsSend.mockResolvedValueOnce({ id: "email_123" });

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ received: true });

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
      const stripeEvent = makeStripeSessionEvent();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(stripeEvent);

      // Idempotency check returns existing event
      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(
        mockEvent({ stripe_session_id: "cs_test_session_456" }) as any,
      );

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ received: true });

      // Should NOT attempt to insert or send email
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("returns 200 but does not create event when no active route exists", async () => {
      const stripeEvent = makeStripeSessionEvent();
      mockStripeWebhooksConstructEvent.mockReturnValueOnce(stripeEvent);

      vi.mocked(db.query.events.findFirst).mockResolvedValueOnce(null as any);
      vi.mocked(db.query.routes.findFirst).mockResolvedValueOnce(null as any);

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const res = await app.request("/webhook/stripe", {
        method: "POST",
        headers: { "stripe-signature": "test-sig" },
        body: "raw-body",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ received: true });

      expect(db.insert).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
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
});
