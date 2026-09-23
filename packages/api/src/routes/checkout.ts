import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import { eq, and, sql } from "drizzle-orm";
import type {
  CheckoutSessionResponse,
  CheckoutSuccessResponse,
} from "@cityroam/shared/types";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { generateEventCode, buildEventUrl } from "@cityroam/shared/utils";
import {
  EVENT_EXPIRY_DAYS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from "@cityroam/shared/constants";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, routes } from "../db/schema/index.js";
import { AppError } from "../middleware/index.js";
import { createLogger } from "../lib/logger.js";
import { findEventByStripeRefs, markEventRefunded } from "../services/refund.js";
import { sendEventCodeEmail } from "../services/email.js";

export const checkoutRoutes = new Hono();

const log = createLogger("checkout");

function getStripe(): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// Route family selection
// ---------------------------------------------------------------------------
/**
 * Route families have no slug column, so marketing segments are mapped to
 * family UUIDs through the CHECKOUT_ROUTE_FAMILY_IDS environment variable.
 *
 * Accepted values:
 *   - a bare UUID — used for every segment
 *   - a JSON object keyed by marketing segment, with an optional "default":
 *     {"default":"<uuid>","hen-parties":"<uuid>","team-building":"<uuid>"}
 *
 * Read lazily (not at module load) so deployments and tests can change it
 * without a restart of the module graph.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEGMENT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function segmentFamilyMap(): Record<string, string> {
  const raw = env.CHECKOUT_ROUTE_FAMILY_IDS?.trim();
  if (!raw) return {};

  if (UUID_RE.test(raw)) return { default: raw };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && UUID_RE.test(value.trim())) {
        map[key] = value.trim();
      } else {
        log.warn("ignoring non-UUID entry in CHECKOUT_ROUTE_FAMILY_IDS", { key });
      }
    }
    return map;
  } catch (err) {
    log.error("CHECKOUT_ROUTE_FAMILY_IDS is not a UUID or JSON object — ignoring", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Resolves the route family for a purchase. Never guesses between several
 * candidates: if the mapping is absent it will only use a family that is the
 * single active one in the database.
 */
async function resolveRouteFamilyId(
  explicitFamilyId: string | undefined,
  segment: string | undefined,
): Promise<{ familyId: string; source: string } | null> {
  if (explicitFamilyId) {
    return { familyId: explicitFamilyId, source: "request" };
  }

  const map = segmentFamilyMap();
  if (segment && map[segment]) {
    return { familyId: map[segment], source: `segment:${segment}` };
  }
  if (map.default) {
    return { familyId: map.default, source: "segment:default" };
  }

  // No mapping configured. Only safe if the database offers exactly one
  // choice — otherwise the buyer would get an arbitrary hunt.
  const activeRoutes = await db.query.routes.findMany({
    where: and(eq(routes.is_active, true), ROUTE_HAS_GROUPS),
    columns: { route_family_id: true },
  });
  const familyIds = [...new Set(activeRoutes.map((r) => r.route_family_id))];

  if (familyIds.length === 1) {
    log.warn(
      "CHECKOUT_ROUTE_FAMILY_IDS is unset — using the only active route family",
      { familyId: familyIds[0], segment: segment ?? null },
    );
    return { familyId: familyIds[0], source: "sole-active-family" };
  }

  log.error("cannot resolve a route family for checkout", {
    segment: segment ?? null,
    activeFamilyCount: familyIds.length,
    mappingConfigured: Object.keys(map).length > 0,
  });
  return null;
}

/**
 * A route with no groups is not a hunt: `startEvent` fails with "Route has no
 * groups" the moment the lead presses start, after the money has changed
 * hands. An empty active route is easy to create — a fresh route defaults to
 * active and has no groups until content is added — so checkout refuses to see
 * one rather than trusting `is_active` alone.
 *
 * The subquery names route_groups literally: inside a relational-query `where`
 * drizzle rewrites every column reference to the outer table's alias, so a
 * `routeGroups.route_id` chunk would silently become `routes.route_id`.
 */
const ROUTE_HAS_GROUPS = sql`EXISTS (SELECT 1 FROM "route_groups" AS g WHERE g."route_id" = ${routes.id})`;

/**
 * Finds the sellable route for a family in the requested language, falling back
 * to the English variant *of the same family* only. Sellable means active and
 * carrying at least one group.
 */
async function resolveRouteInFamily(familyId: string, language: string) {
  const exact = await db.query.routes.findFirst({
    where: and(
      eq(routes.route_family_id, familyId),
      eq(routes.language, language),
      eq(routes.is_active, true),
      ROUTE_HAS_GROUPS,
    ),
  });
  if (exact) return exact;

  if (language === DEFAULT_LANGUAGE) return null;

  return (
    (await db.query.routes.findFirst({
      where: and(
        eq(routes.route_family_id, familyId),
        eq(routes.language, DEFAULT_LANGUAGE),
        eq(routes.is_active, true),
        ROUTE_HAS_GROUPS,
      ),
    })) ?? null
  );
}

function normaliseLanguage(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_LANGUAGE;
  const lower = value.trim().toLowerCase().slice(0, 5);
  const base = lower.split(/[-_]/)[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? base
    : DEFAULT_LANGUAGE;
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

  const event = await findEventByStripeRefs({
    paymentIntentId: opts.paymentIntentId,
  });

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
