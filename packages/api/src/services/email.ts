import { Resend } from "resend";
import { eq } from "drizzle-orm";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { buildEventUrl } from "@cityroam/shared/utils";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events } from "../db/schema/index.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("email");

/**
 * Retry policy for the confirmation email.
 *
 * Three attempts with 1s then 4s between them. The 5s ceiling is deliberate:
 * the webhook waits for this before answering Stripe, and Stripe gives up on a
 * webhook at 10s. A longer ladder would trade a redelivery (harmless — the
 * event already exists, so the retry is a no-op) for a slower endpoint, which
 * is the worse deal.
 *
 * Mutable so tests can collapse the waits without faking timers.
 */
export const emailRetryPolicy = {
  maxAttempts: 3,
  backoffMs: [1000, 4000],
};

export type EmailSendOutcome = {
  sent: boolean;
  attempts: number;
  error: string | null;
};

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * One send attempt. The Resend SDK reports most API failures by *returning*
 * `{ error }` rather than throwing, so a bare try/catch around it treats a
 * rejected send as a success. Both shapes are folded into one result here.
 */
async function attemptSend(payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  try {
    const result = (await new Resend(env.RESEND_API_KEY).emails.send(
      payload,
    )) as { error?: unknown } | null | undefined;

    if (result && typeof result === "object" && result.error) {
      return errorText(result.error);
    }
    return null;
  } catch (err) {
    return errorText(err);
  }
}

/**
 * Sends the event-code email with bounded exponential backoff and records the
 * outcome on the event row.
 *
 * Never throws: the caller is either a Stripe webhook that must still answer
 * 200 once the event exists, or an admin endpoint that reports the failure to
 * the operator. A run that exhausts its attempts leaves `code_email_failed_at`
 * set so the admin event list can surface it and an operator can resend.
 */
export async function sendEventCodeEmail(opts: {
  eventId: string | null;
  code: string;
  buyerEmail: string;
  language: SupportedLanguage;
}): Promise<EmailSendOutcome> {
  const eventUrl = buildEventUrl(env.APP_PUBLIC_URL, opts.code);
  const payload = {
    from: env.RESEND_FROM_EMAIL,
    to: opts.buyerEmail,
    subject: getEmailSubject(opts.language),
    html: buildConfirmationEmail(eventUrl, opts.code, opts.language),
  };

  const maxAttempts = Math.max(1, emailRetryPolicy.maxAttempts);
  let lastError: string | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts = attempt + 1;
    lastError = await attemptSend(payload);

    if (lastError === null) {
      await recordOutcome(opts.eventId, { sent: true, attempts, error: null });
      if (attempt > 0) {
        log.info("confirmation email sent after a retry", {
          eventCode: opts.code,
          attempts,
        });
      }
      return { sent: true, attempts, error: null };
    }

    const isLast = attempt === maxAttempts - 1;
    log.warn("confirmation email attempt failed", {
      eventCode: opts.code,
      attempt: attempts,
      willRetry: !isLast,
      error: lastError,
    });

    if (!isLast) {
      await sleep(emailRetryPolicy.backoffMs[attempt] ?? 0);
    }
  }

  log.error("confirmation email failed after every attempt", {
    eventCode: opts.code,
    attempts,
    error: lastError,
  });
  await recordOutcome(opts.eventId, { sent: false, attempts, error: lastError });
  return { sent: false, attempts, error: lastError };
}

/**
 * Persists the delivery state. A failure to write it must not turn into a
 * failure of the caller — the email itself is the thing that mattered.
 */
async function recordOutcome(
  eventId: string | null,
  outcome: EmailSendOutcome,
): Promise<void> {
  if (!eventId) return;

  const now = new Date();
  try {
    await db
      .update(events)
      .set(
        outcome.sent
          ? {
              code_email_sent_at: now,
              code_email_failed_at: null,
              code_email_error: null,
            }
          : {
              code_email_failed_at: now,
              code_email_error: outcome.error?.slice(0, 500) ?? "unknown error",
            },
      )
      .where(eq(events.id, eventId));
  } catch (err) {
    log.error("could not record confirmation email outcome", {
      eventId,
      error: errorText(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Email content
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
