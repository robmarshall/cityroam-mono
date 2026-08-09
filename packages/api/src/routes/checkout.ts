import { Hono } from "hono";
import Stripe from "stripe";
import { Resend } from "resend";
import { eq, and } from "drizzle-orm";
import type {
  CheckoutSessionResponse,
  CheckoutSuccessResponse,
} from "@cityroam/shared/types";
import type { SupportedLanguage } from "@cityroam/shared/types";
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

  const body = await c.req.json().catch(() => ({}));
  const routeFamilyId = (body as Record<string, unknown>)?.route_family_id as string | undefined;

  const metadata: Record<string, string> = {};
  if (routeFamilyId) {
    metadata.route_family_id = routeFamilyId;
  }

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

    // Find active route — prefer family from metadata, fall back to any active route
    const metadataFamilyId = session.metadata?.route_family_id;
    let activeRoute;

    if (metadataFamilyId) {
      // Find the English (default) variant in the specified family
      activeRoute = await db.query.routes.findFirst({
        where: and(
          eq(routes.route_family_id, metadataFamilyId),
          eq(routes.language, "en"),
          eq(routes.is_active, true),
        ),
      });
      // Fall back to any active variant in the family
      if (!activeRoute) {
        activeRoute = await db.query.routes.findFirst({
          where: and(
            eq(routes.route_family_id, metadataFamilyId),
            eq(routes.is_active, true),
          ),
        });
      }
    }

    // Final fallback: any active route
    if (!activeRoute) {
      activeRoute = await db.query.routes.findFirst({
        where: eq(routes.is_active, true),
      });
    }

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
      const resend = getResend();
      const eventUrl = buildEventUrl(env.APP_PUBLIC_URL, eventCode);
      const emailPayload = {
        from: env.RESEND_FROM_EMAIL,
        to: buyerEmail,
        subject: getEmailSubject(activeRoute.language as SupportedLanguage),
        html: buildConfirmationEmail(eventUrl, eventCode, activeRoute.language as SupportedLanguage),
      };

      try {
        await resend.emails.send(emailPayload);
      } catch (emailErr) {
        log.warn("first email attempt failed, retrying", { error: emailErr instanceof Error ? emailErr.message : String(emailErr) });
        try {
          await resend.emails.send(emailPayload);
        } catch (retryErr) {
          log.error("failed to send confirmation email after retry", { error: retryErr instanceof Error ? retryErr.message : String(retryErr) });
        }
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
/** Per-language email content. */
const EMAIL_CONTENT: Record<SupportedLanguage, {
  subject: string;
  title: string;
  intro: string;
  linkIntro: string;
  linkLabel: string;
  codeLabel: string;
  howTitle: string;
  howBody: string;
  expiry: string;
  refund: string;
}> = {
  en: {
    subject: "Your City Roam experience is booked!",
    title: "Your experience is booked!",
    intro: "Your City Roam event is ready. Share the link below with your group to get started:",
    linkIntro: "Your event link:",
    linkLabel: "Open Event",
    codeLabel: "Event code",
    howTitle: "How it works:",
    howBody: "Share this link with your group. Everyone opens it, enters their name, and the lead person starts when ready.",
    expiry: "Your event is available for 90 days.",
    refund: "Not happy? Reply to this email for a full refund, no questions asked.",
  },
  es: {
    subject: "¡Tu experiencia City Roam está reservada!",
    title: "¡Tu experiencia está reservada!",
    intro: "Tu evento City Roam está listo. Comparte el enlace con tu grupo para empezar:",
    linkIntro: "Tu enlace del evento:",
    linkLabel: "Abrir Evento",
    codeLabel: "Código del evento",
    howTitle: "Cómo funciona:",
    howBody: "Comparte este enlace con tu grupo. Todos lo abren, escriben su nombre, y la persona líder empieza cuando estén listos.",
    expiry: "Tu evento está disponible durante 90 días.",
    refund: "¿No estás contento? Responde a este email para un reembolso completo, sin preguntas.",
  },
  fr: {
    subject: "Votre expérience City Roam est réservée !",
    title: "Votre expérience est réservée !",
    intro: "Votre événement City Roam est prêt. Partagez le lien ci-dessous avec votre groupe pour commencer :",
    linkIntro: "Votre lien d'événement :",
    linkLabel: "Ouvrir l'événement",
    codeLabel: "Code de l'événement",
    howTitle: "Comment ça marche :",
    howBody: "Partagez ce lien avec votre groupe. Tout le monde l'ouvre, entre son nom, et la personne responsable démarre quand tout le monde est prêt.",
    expiry: "Votre événement est disponible pendant 90 jours.",
    refund: "Pas satisfait ? Répondez à cet email pour un remboursement complet, sans questions.",
  },
  de: {
    subject: "Dein City Roam Erlebnis ist gebucht!",
    title: "Dein Erlebnis ist gebucht!",
    intro: "Dein City Roam Event ist bereit. Teile den Link mit deiner Gruppe, um loszulegen:",
    linkIntro: "Dein Event-Link:",
    linkLabel: "Event öffnen",
    codeLabel: "Event-Code",
    howTitle: "So funktioniert's:",
    howBody: "Teile diesen Link mit deiner Gruppe. Alle öffnen ihn, geben ihren Namen ein, und die leitende Person startet, wenn alle bereit sind.",
    expiry: "Dein Event ist 90 Tage lang verfügbar.",
    refund: "Nicht zufrieden? Antworte auf diese E-Mail für eine vollständige Rückerstattung, ohne Fragen.",
  },
  nl: {
    subject: "Je City Roam ervaring is geboekt!",
    title: "Je ervaring is geboekt!",
    intro: "Je City Roam evenement is klaar. Deel de link hieronder met je groep om te beginnen:",
    linkIntro: "Je evenementlink:",
    linkLabel: "Open Evenement",
    codeLabel: "Evenementcode",
    howTitle: "Hoe het werkt:",
    howBody: "Deel deze link met je groep. Iedereen opent hem, vult hun naam in, en de leider start wanneer iedereen klaar is.",
    expiry: "Je evenement is 90 dagen beschikbaar.",
    refund: "Niet tevreden? Antwoord op deze e-mail voor een volledige terugbetaling, zonder vragen.",
  },
};

export function getEmailSubject(language: SupportedLanguage): string {
  return (EMAIL_CONTENT[language] ?? EMAIL_CONTENT.en).subject;
}

export function buildConfirmationEmail(eventUrl: string, eventCode: string, language: SupportedLanguage = "en"): string {
  const t = EMAIL_CONTENT[language] ?? EMAIL_CONTENT.en;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #2563eb; font-size: 24px;">${t.title}</h1>

  <p>${t.intro}</p>

  <div style="background: #f0f4ff; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
    <p style="margin: 0 0 8px; font-size: 14px; color: #666;">${t.linkIntro}</p>
    <a href="${eventUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
      ${t.linkLabel}
    </a>
    <p style="margin: 12px 0 0; font-size: 13px; color: #888;">${t.codeLabel}: <strong>${eventCode}</strong></p>
  </div>

  <p><strong>${t.howTitle}</strong></p>
  <p>${t.howBody}</p>

  <p style="color: #666; font-size: 14px;">${t.expiry}</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

  <p style="color: #999; font-size: 13px;">
    ${t.refund}
  </p>
</body>
</html>`.trim();
}
