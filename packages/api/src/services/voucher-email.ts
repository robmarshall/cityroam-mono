import { eq } from "drizzle-orm";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { buildVoucherRedeemUrl } from "@cityroam/shared/utils";
import { VOUCHER_REDEEM_PATH } from "@cityroam/shared/constants";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { vouchers } from "../db/schema/index.js";
import { createLogger } from "../lib/logger.js";
import { sendWithRetry, type EmailSendOutcome } from "./email.js";

const log = createLogger("voucher-email");

/**
 * The voucher email. It doubles as the printable card: the card is the first
 * block, drawn with a table and a plain border (no background images, which
 * most clients drop when printing), so printing the email puts the card on
 * page one. No attachment and no rendering dependency.
 *
 * The guide's voice: dry, no exclamation marks, and customer-facing copy never
 * mentions AI.
 */
interface VoucherEmailCopy {
  subject: string;
  title: string;
  intro: string;
  tagline: string;
  forLabel: string;
  codeLabel: string;
  validUntil: string;
  redeemAt: string;
  linkLabel: string;
  howTitle: string;
  howBody: string;
  printHint: string;
  footer: string;
  /** BCP 47 locale for the expiry date. */
  dateLocale: string;
}

export const VOUCHER_EMAIL_CONTENT: Record<SupportedLanguage, VoucherEmailCopy> = {
  en: {
    subject: "Your City Roam gift voucher",
    title: "Your gift voucher",
    intro: "Thank you. The voucher is below. Pass the code on, or print this email and hand over the card.",
    tagline: "City Roam — a treasure hunt round Leeds, guided by the Owl",
    forLabel: "For",
    codeLabel: "Voucher code",
    validUntil: "Redeem by {date}",
    redeemAt: "Redeem at",
    linkLabel: "Redeem the voucher",
    howTitle: "How it works",
    howBody: "Whoever holds the code enters it on the redemption page. That creates their game: one link to share with their group, valid for 90 days from redemption.",
    printHint: "To give it on paper, print this email. The card is at the top.",
    footer: "Questions about the voucher? Reply to this email.",
    dateLocale: "en-GB",
  },
  es: {
    subject: "Tu vale regalo de City Roam",
    title: "Tu vale regalo",
    intro: "Gracias. El vale está abajo. Pasa el código, o imprime este email y entrega la tarjeta.",
    tagline: "City Roam — una búsqueda del tesoro por Leeds, guiada por el Búho",
    forLabel: "Para",
    codeLabel: "Código del vale",
    validUntil: "Canjéalo antes del {date}",
    redeemAt: "Canjéalo en",
    linkLabel: "Canjear el vale",
    howTitle: "Cómo funciona",
    howBody: "Quien tenga el código lo introduce en la página de canje. Eso crea su partida: un enlace para compartir con su grupo, válido durante 90 días desde el canje.",
    printHint: "Para regalarlo en papel, imprime este email. La tarjeta está arriba.",
    footer: "¿Alguna pregunta sobre el vale? Responde a este email.",
    dateLocale: "es-ES",
  },
  fr: {
    subject: "Votre bon cadeau City Roam",
    title: "Votre bon cadeau",
    intro: "Merci. Le bon est ci-dessous. Transmettez le code, ou imprimez cet email et offrez la carte.",
    tagline: "City Roam — une chasse au trésor dans Leeds, guidée par le Hibou",
    forLabel: "Pour",
    codeLabel: "Code du bon",
    validUntil: "À utiliser avant le {date}",
    redeemAt: "À utiliser sur",
    linkLabel: "Utiliser le bon",
    howTitle: "Comment ça marche",
    howBody: "La personne qui détient le code le saisit sur la page d'activation. Cela crée sa partie : un lien à partager avec son groupe, valable 90 jours à partir de l'activation.",
    printHint: "Pour l'offrir sur papier, imprimez cet email. La carte est en haut.",
    footer: "Une question sur le bon ? Répondez à cet email.",
    dateLocale: "fr-FR",
  },
  de: {
    subject: "Dein Geschenkgutschein für City Roam",
    title: "Dein Geschenkgutschein",
    intro: "Danke. Der Gutschein steht unten. Gib den Code weiter, oder drucke diese E-Mail aus und überreiche die Karte.",
    tagline: "City Roam — eine Schatzsuche durch Leeds, geführt von der Eule",
    forLabel: "Für",
    codeLabel: "Gutscheincode",
    validUntil: "Einlösbar bis {date}",
    redeemAt: "Einlösen unter",
    linkLabel: "Gutschein einlösen",
    howTitle: "So funktioniert's",
    howBody: "Wer den Code hat, gibt ihn auf der Einlöseseite ein. Damit entsteht das Spiel: ein Link für die ganze Gruppe, 90 Tage ab dem Einlösen gültig.",
    printHint: "Zum Verschenken auf Papier diese E-Mail ausdrucken. Die Karte steht oben.",
    footer: "Fragen zum Gutschein? Antworte auf diese E-Mail.",
    dateLocale: "de-DE",
  },
  nl: {
    subject: "Je City Roam-cadeaubon",
    title: "Je cadeaubon",
    intro: "Bedankt. De bon staat hieronder. Geef de code door, of print deze e-mail en geef de kaart.",
    tagline: "City Roam — een speurtocht door Leeds, begeleid door de Uil",
    forLabel: "Voor",
    codeLabel: "Boncode",
    validUntil: "In te wisselen tot {date}",
    redeemAt: "Inwisselen op",
    linkLabel: "Bon inwisselen",
    howTitle: "Hoe het werkt",
    howBody: "Wie de code heeft, vult hem in op de inwisselpagina. Daarmee ontstaat het spel: één link om met de groep te delen, 90 dagen geldig vanaf het inwisselen.",
    printHint: "Wil je hem op papier geven? Print deze e-mail. De kaart staat bovenaan.",
    footer: "Vragen over de bon? Antwoord op deze e-mail.",
    dateLocale: "nl-NL",
  },
};

function copyFor(language: string): VoucherEmailCopy {
  return (VOUCHER_EMAIL_CONTENT as Record<string, VoucherEmailCopy>)[language] ?? VOUCHER_EMAIL_CONTENT.en;
}

/** Minimal HTML escaping for values that came from a buyer. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The expiry date as a person reads it, in UK time. */
export function formatVoucherDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(copyFor(language).dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(date);
}

export function getVoucherEmailSubject(language: string): string {
  return copyFor(language).subject;
}

export interface VoucherEmailInput {
  code: string;
  expiresAt: Date;
  language: string;
  recipientName?: string | null;
  message?: string | null;
}

export function buildVoucherEmail(input: VoucherEmailInput): string {
  const t = copyFor(input.language);
  const redeemUrl = buildVoucherRedeemUrl(env.MARKETING_URL, input.language, input.code);
  const shortUrl = `${env.MARKETING_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}/${input.language}${VOUCHER_REDEEM_PATH}`;
  const date = formatVoucherDate(input.expiresAt, input.language);
  const code = escapeHtml(input.code);

  const forLine = input.recipientName
    ? `<p style="margin: 0 0 12px; font-size: 16px; color: #14213D;">${t.forLabel} ${escapeHtml(input.recipientName)}</p>`
    : "";
  const messageBlock = input.message
    ? `<p style="margin: 0 0 16px; font-size: 15px; font-style: italic; color: #2A3654;">${escapeHtml(input.message).replace(/\r?\n/g, "<br>")}</p>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media print {
      .no-print { display: none !important; }
      .card { page-break-inside: avoid; }
    }
  </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #2A3654; background: #ffffff;">
  <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid #14213D; border-radius: 8px; margin: 0 0 24px;">
    <tr>
      <td style="padding: 28px 24px; text-align: center;">
        <p style="margin: 0 0 16px; font-size: 13px; letter-spacing: 0.04em; color: #4A5670;">${t.tagline}</p>
        ${forLine}
        ${messageBlock}
        <p style="margin: 0 0 4px; font-size: 13px; color: #4A5670;">${t.codeLabel}</p>
        <p style="margin: 0 0 16px; font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: 700; letter-spacing: 0.08em; color: #14213D;">${code}</p>
        <p style="margin: 0 0 4px; font-size: 14px; color: #2A3654;">${t.validUntil.replace("{date}", escapeHtml(date))}</p>
        <p style="margin: 0; font-size: 14px; color: #2A3654;">${t.redeemAt} ${escapeHtml(shortUrl)}</p>
      </td>
    </tr>
  </table>

  <div class="no-print">
    <h1 style="color: #14213D; font-size: 22px;">${t.title}</h1>
    <p>${t.intro}</p>

    <p style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(redeemUrl)}" style="display: inline-block; background: #B5452B; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">${t.linkLabel}</a>
    </p>

    <p><strong>${t.howTitle}</strong></p>
    <p>${t.howBody}</p>

    <p style="color: #5C5A55; font-size: 14px;">${t.printHint}</p>

    <hr style="border: none; border-top: 1px solid #DDD5C6; margin: 24px 0;">

    <p style="color: #5C5A55; font-size: 13px;">${t.footer}</p>
  </div>
</body>
</html>`.trim();
}

/**
 * Sends the voucher email with the shared retry ladder and records the
 * outcome on the voucher row. Never throws, for the same reasons as the
 * event-code email: the webhook must still answer 200 once the voucher exists,
 * and the admin panel can resend.
 */
export async function sendVoucherEmail(opts: {
  voucherId: string | null;
  to: string;
} & VoucherEmailInput): Promise<EmailSendOutcome> {
  const payload = {
    from: env.RESEND_FROM_EMAIL,
    to: opts.to,
    subject: getVoucherEmailSubject(opts.language),
    html: buildVoucherEmail(opts),
  };

  const outcome = await sendWithRetry(payload, "voucher email", {
    voucherId: opts.voucherId,
  });

  if (opts.voucherId) {
    const now = new Date();
    try {
      await db
        .update(vouchers)
        .set(
          outcome.sent
            ? { email_sent_at: now, email_failed_at: null, email_error: null }
            : {
                email_failed_at: now,
                email_error: outcome.error?.slice(0, 500) ?? "unknown error",
              },
        )
        .where(eq(vouchers.id, opts.voucherId));
    } catch (err) {
      log.error("could not record voucher email outcome", {
        voucherId: opts.voucherId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return outcome;
}
