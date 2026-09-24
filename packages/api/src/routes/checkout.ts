import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import { eq, and, sql } from "drizzle-orm";
import type {
  CheckoutSessionResponse,
  CheckoutSuccessResponse,
  VoucherCheckoutSessionResponse,
  VoucherCheckoutSuccessResponse,
} from "@cityroam/shared/types";
import type { SupportedLanguage } from "@cityroam/shared/types";
import {
  generateEventCode,
  buildEventUrl,
  buildVoucherRedeemUrl,
} from "@cityroam/shared/utils";
import { EVENT_EXPIRY_DAYS, DEFAULT_LANGUAGE } from "@cityroam/shared/constants";
import { createVoucherSessionSchema } from "@cityroam/shared/validation";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, routes, vouchers } from "../db/schema/index.js";
import { AppError } from "../middleware/index.js";
import { createLogger } from "../lib/logger.js";
import { findEventByStripeRefs, markEventRefunded } from "../services/refund.js";
import { sendEventCodeEmail } from "../services/email.js";
import {
  UUID_RE,
  SEGMENT_RE,
  ROUTE_HAS_GROUPS,
  normaliseLanguage,
  resolveRouteFamilyId,
  resolveRouteInFamily,
} from "../services/route-selection.js";
import {
  VOUCHER_METADATA_KIND,
  applyVoucherRefund,
  fulfilVoucherSession,
} from "../services/vouchers.js";

export const checkoutRoutes = new Hono();

const log = createLogger("checkout");

function getStripe(): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// POST /checkout/create-session
// ---------------------------------------------------------------------------
checkoutRoutes.post("/checkout/create-session", async (c) => {
  const stripe = getStripe();

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const rawFamilyId =
    typeof body?.route_family_id === "string" ? body.route_family_id.trim() : "";
  if (rawFamilyId && !UUID_RE.test(rawFamilyId)) {
    throw new AppError(400, "route_family_id must be a UUID", "INVALID_INPUT");
  }

  const rawSegment =
    typeof body?.segment === "string" ? body.segment.trim().toLowerCase() : "";
  if (rawSegment && !SEGMENT_RE.test(rawSegment)) {
    throw new AppError(400, "segment is not a valid identifier", "INVALID_INPUT");
  }

  const requestedLanguage = normaliseLanguage(body?.language);

  const family = await resolveRouteFamilyId(
    rawFamilyId || undefined,
    rawSegment || undefined,
  );
  if (!family) {
    // Hard failure before payment beats an arbitrary hunt after payment.
    throw new AppError(
      400,
      "No hunt is configured for this selection",
      "INVALID_INPUT",
    );
  }

  const route = await resolveRouteInFamily(family.familyId, requestedLanguage);
  if (!route) {
    log.error("no active route in the resolved family", {
      familyId: family.familyId,
      source: family.source,
      requestedLanguage,
    });
    throw new AppError(
      400,
      "No hunt is currently available for this selection",
      "INVALID_INPUT",
    );
  }

  // The route is pinned here so the webhook never has to guess. The family and
  // language ride along for diagnostics and for legacy-session recovery.
  const metadata: Record<string, string> = {
    route_id: route.id,
    route_family_id: route.route_family_id,
    route_language: route.language,
    requested_language: requestedLanguage,
    family_source: family.source,
  };
  if (rawSegment) metadata.segment = rawSegment;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${env.MARKETING_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.MARKETING_URL,
    metadata,
  });

  if (!session.url) {
    throw new AppError(500, "Failed to create checkout session", "INTERNAL_ERROR");
  }

  const response: CheckoutSessionResponse = { url: session.url };
  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// POST /checkout/create-voucher-session
// ---------------------------------------------------------------------------
/**
 * Starts a Stripe Checkout for a gift voucher. Same price as a game
 * (STRIPE_PRICE_ID). No event is created on payment; the webhook creates a
 * voucher instead (metadata.kind = "voucher") and emails the buyer the code.
 */
checkoutRoutes.post("/checkout/create-voucher-session", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const data = createVoucherSessionSchema.parse(body ?? {});
  const language = data.language ?? DEFAULT_LANGUAGE;
  const familyId = data.route_family_id ?? null;

  // Refuse before payment if the voucher could not be redeemed today. A
  // family-specific voucher needs a sellable route in that family; an
  // any-family voucher needs the default family to resolve.
  if (familyId) {
    if (!(await resolveRouteInFamily(familyId, language))) {
      throw new AppError(400, "No hunt is currently available for this selection", "INVALID_INPUT");
    }
  } else if (!(await resolveRouteFamilyId(undefined, undefined))) {
    throw new AppError(400, "No hunt is configured for this selection", "INVALID_INPUT");
  }

  const metadata: Record<string, string> = {
    kind: VOUCHER_METADATA_KIND,
    language,
    route_family_id: familyId ?? "",
  };
  if (data.recipient_name) metadata.recipient_name = data.recipient_name;
  if (data.message) metadata.message = data.message;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${env.MARKETING_URL}/${language}/gift/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.MARKETING_URL}/${language}/gift`,
    metadata,
    // Tags the payment too, so a voucher sale is recognisable in the Stripe
    // dashboard when someone refunds it there.
    payment_intent_data: { metadata: { kind: VOUCHER_METADATA_KIND } },
  });

  if (!session.url) {
    throw new AppError(500, "Failed to create checkout session", "INTERNAL_ERROR");
  }

  const response: VoucherCheckoutSessionResponse = { url: session.url };
  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// GET /checkout/voucher-success
// ---------------------------------------------------------------------------
/**
 * What the voucher purchase success page shows. 404 until the webhook has
 * created the voucher, so the page polls, like /checkout/success.
 */
checkoutRoutes.get("/checkout/voucher-success", async (c) => {
  const sessionId = c.req.query("session_id");
  if (!sessionId) {
    throw new AppError(400, "Missing session_id parameter", "INVALID_INPUT");
  }

  const voucher = await db.query.vouchers.findFirst({
    where: eq(vouchers.stripe_session_id, sessionId),
  });
  if (!voucher) {
    throw new AppError(404, "Voucher not found for this session", "VOUCHER_NOT_FOUND");
  }

  const language = normaliseLanguage(voucher.language) as SupportedLanguage;
  const response: VoucherCheckoutSuccessResponse = {
    voucher_code: voucher.code,
    expires_at: voucher.expires_at.toISOString(),
    redeem_url: buildVoucherRedeemUrl(env.MARKETING_URL, language, voucher.code),
    language,
  };
  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// POST /webhook/stripe
// ---------------------------------------------------------------------------
checkoutRoutes.post("/webhook/stripe", async (c) => {
  const stripe = getStripe();
  const rawBody = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    throw new AppError(400, "Missing stripe-signature header", "INVALID_INPUT");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new AppError(400, "Invalid webhook signature", "INVALID_INPUT");
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only a settled payment earns a playable hunt. Delayed methods arrive as
    // completed-but-unpaid and settle later via async_payment_succeeded.
    // A 100% discount code settles as no_payment_required and is a real sale.
    if (!SETTLED_PAYMENT_STATUSES.has(session.payment_status ?? "")) {
      log.info("checkout session is not paid — no event created", {
        sessionId: session.id,
        eventType: event.type,
        paymentStatus: session.payment_status ?? null,
      });
      return c.json({ received: true }, 200);
    }

    if (session.metadata?.kind === VOUCHER_METADATA_KIND) {
      return await fulfilVoucherCheckout(c, session);
    }

    return await fulfilCheckoutSession(c, session);
  }

  if (event.type === "charge.refunded") {
    return await handleChargeRefunded(c, event.data.object as Stripe.Charge);
  }

  if (event.type === "charge.dispute.created") {
    return await handleDisputeCreated(c, event.data.object as Stripe.Dispute);
  }

  return c.json({ received: true }, 200);
});

/**
 * A refund issued from the Stripe dashboard never touches the admin endpoint,
 * so without this the money goes back and the hunt stays playable. Only a
 * whole-charge refund kills the event; a partial refund is a goodwill gesture
 * and leaves the hunt alone.
 */
async function handleChargeRefunded(c: Context, charge: Stripe.Charge) {
  const paymentIntentId = stripeRefId(charge.payment_intent);
  const fullyRefunded =
    charge.amount > 0 && charge.amount_refunded >= charge.amount;

  if (!fullyRefunded) {
    log.info("partial refund — event left playable", {
      chargeId: charge.id,
      paymentIntentId,
      amount: charge.amount,
      amountRefunded: charge.amount_refunded,
    });
    return c.json({ received: true }, 200);
  }

  return await applyRefundToEvent(c, {
    paymentIntentId,
    source: "stripe:charge.refunded",
    reference: charge.id,
  });
}

/**
 * A dispute means the funds are already withheld, so the event stops now
 * rather than when the dispute resolves weeks later.
 */
async function handleDisputeCreated(c: Context, dispute: Stripe.Dispute) {
  return await applyRefundToEvent(c, {
    paymentIntentId: stripeRefId(dispute.payment_intent),
    source: "stripe:charge.dispute.created",
    reference: dispute.id,
  });
}

/**
 * Shared tail of both handlers. Idempotent: a redelivered webhook finds the
 * event already REFUNDED and does nothing. A charge we cannot match to an
 * event is acknowledged rather than retried — Stripe would otherwise redeliver
 * a refund for a payment this system never recorded until it gave up.
 */
async function applyRefundToEvent(
  c: Context,
  opts: { paymentIntentId: string | null; source: string; reference: string },
) {
  if (!opts.paymentIntentId) {
    log.warn("refund webhook carried no payment intent — ignoring", {
      source: opts.source,
      reference: opts.reference,
    });
    return c.json({ received: true }, 200);
  }

  // A voucher sale has no event until it is redeemed. An unredeemed voucher
  // is refunded on its own; a redeemed one falls through to its event.
  const voucherOutcome = await applyVoucherRefund(opts.paymentIntentId, opts.source);
  if (voucherOutcome.kind === "voucher-refunded") {
    return c.json({ received: true }, 200);
  }

  let event = await findEventByStripeRefs({
    paymentIntentId: opts.paymentIntentId,
  });
  if (!event && voucherOutcome.kind === "voucher-redeemed" && voucherOutcome.eventId) {
    event =
      (await db.query.events.findFirst({
        where: eq(events.id, voucherOutcome.eventId),
      })) ?? null;
  }

  if (!event) {
    log.warn("no event matches the refunded payment — ignoring", {
      source: opts.source,
      reference: opts.reference,
      paymentIntentId: opts.paymentIntentId,
    });
    return c.json({ received: true }, 200);
  }

  if (event.status === "REFUNDED") {
    log.info("event already refunded — no-op", {
      source: opts.source,
      eventId: event.id,
      eventCode: event.code,
    });
    return c.json({ received: true }, 200);
  }

  await markEventRefunded(event.id, opts.source);

  return c.json({ received: true }, 200);
}

/** Stripe expandable fields arrive as either an id or the whole object. */
function stripeRefId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

/**
 * Creates the event for a paid checkout session, sends the confirmation email
 * and returns the webhook response. Safe to call more than once for the same
 * session: the unique index on events.stripe_session_id makes the second call
 * a no-op.
 */
async function fulfilCheckoutSession(
  c: Context,
  session: Stripe.Checkout.Session,
) {
  // Fast path: an earlier delivery already created the event.
  const existing = await db.query.events.findFirst({
    where: eq(events.stripe_session_id, session.id),
  });

  if (existing) {
    log.info("checkout session already fulfilled — no-op", {
      sessionId: session.id,
      eventCode: existing.code,
    });
    return c.json({ received: true }, 200);
  }

  const buyerEmail = session.customer_details?.email ?? null;
  const stripePaymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const activeRoute = await resolveRouteForSession(session);

  if (!activeRoute) {
    log.error("no active route found — returning 500 so Stripe retries", {
      sessionId: session.id,
    });
    return c.json({ error: "No active route" }, 500);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + EVENT_EXPIRY_DAYS);

  let eventCode: string | null = null;
  let eventId: string | null = null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const candidate = generateEventCode();
    try {
      const inserted = await db
        .insert(events)
        .values({
          code: candidate,
          status: "NOT_STARTED",
          route_id: activeRoute.id,
          route_family_id: activeRoute.route_family_id,
          language: activeRoute.language,
          stripe_session_id: session.id,
          stripe_payment_id: stripePaymentId,
          buyer_email: buyerEmail,
          expires_at: expiresAt,
        })
        // Only the session conflict is swallowed here. An event-code collision
        // still raises, so it can be retried with a fresh code.
        .onConflictDoNothing({ target: events.stripe_session_id })
        .returning({ id: events.id, code: events.code });

      if (!inserted || inserted.length === 0) {
        const concurrent = await db.query.events.findFirst({
          where: eq(events.stripe_session_id, session.id),
        });
        log.info("concurrent webhook already created event", {
          sessionId: session.id,
          eventCode: concurrent?.code ?? null,
        });
        return c.json({ received: true }, 200);
      }

      eventId = inserted[0].id;
      eventCode = inserted[0].code ?? candidate;
      break;
    } catch (dbErr) {
      if (isEventCodeConflict(dbErr)) {
        log.warn("event code collision — retrying with a new code", {
          sessionId: session.id,
          attempt: attempt + 1,
        });
        continue;
      }
      log.error("failed to insert event — returning 500 so Stripe retries", {
        sessionId: session.id,
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
      return c.json({ error: "Database error" }, 500);
    }
  }

  if (!eventCode) {
    log.error(
      "failed to generate unique event code — returning 500 so Stripe retries",
      { sessionId: session.id, attempts: CODE_ATTEMPTS },
    );
    return c.json({ error: "Event code generation failed" }, 500);
  }

  // The email carries the only lasting copy of the code, so it retries with
  // backoff and records a failure on the event rather than only logging one.
  // A send that never lands must not turn into a 500: the event exists, the
  // buyer can still be reached from the admin panel, and a Stripe retry would
  // only repeat the same failing send.
  if (buyerEmail) {
    await sendEventCodeEmail({
      eventId,
      code: eventCode,
      buyerEmail,
      language: activeRoute.language as SupportedLanguage,
    });
  }

  return c.json({ received: true }, 200);
}

/** Webhook wrapper: a database failure answers 500 so Stripe retries. */
async function fulfilVoucherCheckout(
  c: Context,
  session: Stripe.Checkout.Session,
) {
  try {
    await fulfilVoucherSession(session);
  } catch (err) {
    log.error("failed to create voucher — returning 500 so Stripe retries", {
      sessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ error: "Voucher creation failed" }, 500);
  }
  return c.json({ received: true }, 200);
}

const CODE_ATTEMPTS = 5;

/** Payment states that mean the buyer owes nothing further. */
const SETTLED_PAYMENT_STATUSES = new Set(["paid", "no_payment_required"]);

const PG_UNIQUE_VIOLATION = "23505";

/** Walks the error chain for a Postgres unique violation and names it. */
function uniqueViolationTarget(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 5; depth++) {
    const candidate = current as Record<string, unknown>;
    if (candidate.code === PG_UNIQUE_VIOLATION) {
      return String(
        candidate.constraint_name ??
          candidate.constraint ??
          candidate.detail ??
          candidate.message ??
          "",
      );
    }
    current = candidate.cause;
  }
  return null;
}

function isEventCodeConflict(err: unknown): boolean {
  const target = uniqueViolationTarget(err);
  if (target === null) return false;
  const haystack = target.toLowerCase();
  return haystack.includes("events_code") || haystack.includes("(code)");
}

/**
 * Picks the route for a session. The route is pinned into metadata at
 * create-session time; the family and the any-active-route fallbacks exist
 * only for sessions created before that pinning shipped.
 */
async function resolveRouteForSession(session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};

  if (metadata.route_id) {
    const pinned = await db.query.routes.findFirst({
      where: and(
        eq(routes.id, metadata.route_id),
        eq(routes.is_active, true),
        ROUTE_HAS_GROUPS,
      ),
    });
    if (pinned) return pinned;
    log.error("route pinned at checkout is missing or inactive", {
      sessionId: session.id,
      routeId: metadata.route_id,
    });
  }

  if (metadata.route_family_id) {
    const language = normaliseLanguage(
      metadata.route_language ?? metadata.requested_language,
    );
    const inFamily = await resolveRouteInFamily(metadata.route_family_id, language);
    if (inFamily) return inFamily;
    log.error("no active route in the family recorded on the session", {
      sessionId: session.id,
      familyId: metadata.route_family_id,
      language,
    });
    // Never leave the family — an unrelated hunt is worse than a retry.
    return null;
  }

  log.error(
    "LEGACY SESSION: no route metadata — falling back to an arbitrary active route",
    { sessionId: session.id },
  );
  return (
    (await db.query.routes.findFirst({
      where: and(eq(routes.is_active, true), ROUTE_HAS_GROUPS),
    })) ?? null
  );
}

// ---------------------------------------------------------------------------
// GET /checkout/success
// ---------------------------------------------------------------------------
checkoutRoutes.get("/checkout/success", async (c) => {
  const sessionId = c.req.query("session_id");

  if (!sessionId) {
    throw new AppError(400, "Missing session_id parameter", "INVALID_INPUT");
  }

  const event = await db.query.events.findFirst({
    where: eq(events.stripe_session_id, sessionId),
  });

  if (!event) {
    throw new AppError(404, "Event not found for this session", "EVENT_NOT_FOUND");
  }

  const eventUrl = buildEventUrl(env.APP_PUBLIC_URL, event.code);

  const response: CheckoutSuccessResponse = {
    event_code: event.code,
    event_url: eventUrl,
  };

  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// The email content and the retrying sender live in services/email.ts so the
// admin resend endpoint uses exactly the same body and the same backoff.
// Re-exported here because that is where they used to live.
export { getEmailSubject, buildConfirmationEmail } from "../services/email.js";
