import { Hono } from "hono";
import Stripe from "stripe";
import { Resend } from "resend";
import { eq, and } from "drizzle-orm";
import type {
  CheckoutSessionResponse,
  CheckoutSuccessResponse,
} from "@cityroam/shared/types";
import { generateEventCode, buildEventUrl } from "@cityroam/shared/utils";
import { EVENT_EXPIRY_DAYS } from "@cityroam/shared/constants";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, routes } from "../db/schema/index.js";
import { AppError } from "../middleware/index.js";
import { createLogger } from "../lib/logger.js";

export const checkoutRoutes = new Hono();

const log = createLogger("checkout");

function getStripe(): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY);
}

function getResend(): Resend {
  return new Resend(env.RESEND_API_KEY);
}

// ---------------------------------------------------------------------------
// POST /checkout/create-session
// ---------------------------------------------------------------------------
checkoutRoutes.post("/checkout/create-session", async (c) => {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${env.MARKETING_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.MARKETING_URL,
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Idempotency: check if event already created for this session
    const existing = await db.query.events.findFirst({
      where: eq(events.stripe_session_id, session.id),
    });

    if (existing) {
      return c.json({ received: true }, 200);
    }

    const buyerEmail = session.customer_details?.email ?? null;
    const stripePaymentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    // Find active route
    const activeRoute = await db.query.routes.findFirst({
      where: eq(routes.is_active, true),
    });

    if (!activeRoute) {
      log.error("no active route found — returning 500 so Stripe retries");
      return c.json({ error: "No active route" }, 500);
    }

    // Generate unique event code with retry on collision
    let eventCode: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateEventCode();
      const conflict = await db.query.events.findFirst({
        where: eq(events.code, candidate),
      });
      if (!conflict) {
        eventCode = candidate;
        break;
      }
    }

    if (!eventCode) {
      log.error("failed to generate unique event code — returning 500 so Stripe retries", { attempts: 5 });
      return c.json({ error: "Event code generation failed" }, 500);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EVENT_EXPIRY_DAYS);

    try {
      await db.insert(events).values({
        code: eventCode,
        status: "NOT_STARTED",
        route_id: activeRoute.id,
        route_family_id: activeRoute.route_family_id,
        language: activeRoute.language,
        stripe_session_id: session.id,
        stripe_payment_id: stripePaymentId,
        buyer_email: buyerEmail,
        expires_at: expiresAt,
      });
    } catch (dbErr) {
      // If a concurrent webhook already inserted this session, treat as success
      const msg = dbErr instanceof Error ? dbErr.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        log.info("concurrent webhook already created event", { sessionId: session.id });
        return c.json({ received: true }, 200);
      }
      log.error("failed to insert event — returning 500 so Stripe retries", { error: msg });
      return c.json({ error: "Database error" }, 500);
    }

    // Send confirmation email (non-blocking — log errors but don't fail)
    if (buyerEmail) {
      try {
        const resend = getResend();
        const eventUrl = buildEventUrl(env.APP_URL, eventCode);

        await resend.emails.send({
          from: env.RESEND_FROM_EMAIL,
          to: buyerEmail,
          subject: "Your City Roam experience is booked!",
          html: buildConfirmationEmail(eventUrl, eventCode),
        });
      } catch (emailErr) {
        log.error("failed to send confirmation email", { error: emailErr instanceof Error ? emailErr.message : String(emailErr) });
      }
    }
  }

  return c.json({ received: true }, 200);
});

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

  const eventUrl = buildEventUrl(env.APP_URL, event.code);

  const response: CheckoutSuccessResponse = {
    event_code: event.code,
    event_url: eventUrl,
  };

  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildConfirmationEmail(eventUrl: string, eventCode: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #2563eb; font-size: 24px;">Your experience is booked!</h1>

  <p>Your City Roam event is ready. Share the link below with your group to get started:</p>

  <div style="background: #f0f4ff; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
    <p style="margin: 0 0 8px; font-size: 14px; color: #666;">Your event link:</p>
    <a href="${eventUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
      Open Event
    </a>
    <p style="margin: 12px 0 0; font-size: 13px; color: #888;">Event code: <strong>${eventCode}</strong></p>
  </div>

  <p><strong>How it works:</strong></p>
  <p>Share this link with your group. Everyone opens it, enters their name, and the lead person starts when ready.</p>

  <p style="color: #666; font-size: 14px;">Your event is available for 90 days.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

  <p style="color: #999; font-size: 13px;">
    Not happy? Reply to this email for a full refund, no questions asked.
  </p>
</body>
</html>`.trim();
}
