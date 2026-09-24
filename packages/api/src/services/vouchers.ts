import type Stripe from "stripe";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { SupportedLanguage, VoucherStatus } from "@cityroam/shared/types";
import {
  EVENT_EXPIRY_DAYS,
  VOUCHER_EXPIRY_MONTHS,
  VOUCHER_MESSAGE_MAX_LENGTH,
  VOUCHER_RECIPIENT_NAME_MAX_LENGTH,
} from "@cityroam/shared/constants";
import { generateEventCode, generateVoucherCode } from "@cityroam/shared/utils";
import { db } from "../db/index.js";
import { events, vouchers } from "../db/schema/index.js";
import { AppError } from "../middleware/error-handler.js";
import { createLogger } from "../lib/logger.js";
import {
  UUID_RE,
  normaliseLanguage,
  resolveRouteFamilyId,
  resolveRouteInFamily,
} from "./route-selection.js";
import { sendVoucherEmail } from "./voucher-email.js";
import { sendEventCodeEmail } from "./email.js";

const log = createLogger("vouchers");

export type VoucherRow = typeof vouchers.$inferSelect;

/** Stripe metadata value that marks a checkout session as a voucher sale. */
export const VOUCHER_METADATA_KIND = "voucher";

const CODE_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = "23505";

/** Add calendar months in UTC ("12 months after purchase"). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function voucherExpiryFrom(purchasedAt: Date): Date {
  return addMonths(purchasedAt, VOUCHER_EXPIRY_MONTHS);
}

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

export function isVoucherCodeConflict(err: unknown): boolean {
  const target = uniqueViolationTarget(err)?.toLowerCase();
  if (target == null) return false;
  return target.includes("vouchers_code") || target.includes("(code)");
}

/** Caps a metadata string again on the way back in; Stripe metadata is not ours to trust blindly. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Purchase (Stripe webhook)
// ---------------------------------------------------------------------------

export type VoucherFulfilment =
  | { outcome: "created"; voucher: VoucherRow; emailSent: boolean | null }
  | { outcome: "exists"; voucher: VoucherRow | null };

/**
 * Creates the voucher for a paid voucher checkout session and emails the
 * buyer. Idempotent on the unique stripe_session_id: a redelivered or
 * concurrent webhook finds the voucher already there and does nothing.
 *
 * Throws on database failure so the webhook answers 500 and Stripe retries.
 */
export async function fulfilVoucherSession(
  session: Stripe.Checkout.Session,
): Promise<VoucherFulfilment> {
  const existing = await db.query.vouchers.findFirst({
    where: eq(vouchers.stripe_session_id, session.id),
  });
  if (existing) {
    log.info("voucher session already fulfilled — no-op", { sessionId: session.id });
    return { outcome: "exists", voucher: existing };
  }

  const metadata = session.metadata ?? {};
  const language = normaliseLanguage(metadata.language) as SupportedLanguage;
  const familyId =
    typeof metadata.route_family_id === "string" && UUID_RE.test(metadata.route_family_id)
      ? metadata.route_family_id
      : null;
  const purchaserEmail = session.customer_details?.email ?? null;
  const stripePaymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const now = new Date();
  const values = {
    status: "PURCHASED" as const,
    purchaser_email: purchaserEmail,
    recipient_name: cleanText(metadata.recipient_name, VOUCHER_RECIPIENT_NAME_MAX_LENGTH),
    message: cleanText(metadata.message, VOUCHER_MESSAGE_MAX_LENGTH),
    language,
    route_family_id: familyId,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
    stripe_session_id: session.id,
    stripe_payment_id: stripePaymentId,
    created_at: now,
    expires_at: voucherExpiryFrom(now),
  };

  let created: VoucherRow | null = null;
  for (let attempt = 0; attempt < CODE_ATTEMPTS && !created; attempt++) {
    try {
      const rows = await db
        .insert(vouchers)
        .values({ ...values, code: generateVoucherCode() })
        // Only the session conflict is swallowed; a code collision still
        // raises and is retried with a fresh code.
        .onConflictDoNothing({ target: vouchers.stripe_session_id })
        .returning();

      if (!rows || rows.length === 0) {
        const concurrent = await db.query.vouchers.findFirst({
          where: eq(vouchers.stripe_session_id, session.id),
        });
        log.info("concurrent webhook already created the voucher", { sessionId: session.id });
        return { outcome: "exists", voucher: concurrent ?? null };
      }
      created = rows[0];
    } catch (err) {
      if (isVoucherCodeConflict(err)) {
        log.warn("voucher code collision — retrying with a new code", {
          sessionId: session.id,
          attempt: attempt + 1,
        });
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new Error(`could not generate a unique voucher code after ${CODE_ATTEMPTS} attempts`);
  }

  log.info("voucher created", { voucherId: created.id, sessionId: session.id });

  let emailSent: boolean | null = null;
  if (purchaserEmail) {
    const outcome = await sendVoucherEmail({
      voucherId: created.id,
      to: purchaserEmail,
      code: created.code,
      expiresAt: created.expires_at,
      language: created.language,
      recipientName: created.recipient_name,
      message: created.message,
    });
    emailSent = outcome.sent;
  }

  return { outcome: "created", voucher: created, emailSent };
}

// ---------------------------------------------------------------------------
// Refunds and disputes (Stripe webhook)
// ---------------------------------------------------------------------------

export type VoucherRefundOutcome =
  /** The payment is not a voucher sale. */
  | { kind: "not-voucher" }
  /** The unredeemed voucher is now REFUNDED (or already was). */
  | { kind: "voucher-refunded"; voucherId: string }
  /**
   * The voucher had already been redeemed. It stays REDEEMED and the caller
   * refunds the event it created, exactly as for a game purchase.
   */
  | { kind: "voucher-redeemed"; voucherId: string; eventId: string | null };

/**
 * Applies a whole refund or a dispute to the voucher bought with this payment.
 *
 * An unredeemed voucher (PURCHASED, EXPIRED or VOID) becomes REFUNDED. The
 * update is a compare-and-swap on the status, so a redemption racing the
 * refund either lands first (and the event is refunded instead) or finds the
 * voucher REFUNDED and is refused.
 */
export async function applyVoucherRefund(
  paymentIntentId: string,
  source: string,
): Promise<VoucherRefundOutcome> {
  const voucher = await db.query.vouchers.findFirst({
    where: eq(vouchers.stripe_payment_id, paymentIntentId),
  });
  if (!voucher) return { kind: "not-voucher" };

  if (voucher.status === "REDEEMED") {
    return { kind: "voucher-redeemed", voucherId: voucher.id, eventId: voucher.redeemed_event_id };
  }
  if (voucher.status === "REFUNDED") {
    log.info("voucher already refunded — no-op", { voucherId: voucher.id, source });
    return { kind: "voucher-refunded", voucherId: voucher.id };
  }

  const updated = await db
    .update(vouchers)
    .set({ status: "REFUNDED", refunded_at: new Date() })
    .where(
      and(
        eq(vouchers.id, voucher.id),
        inArray(vouchers.status, ["PURCHASED", "EXPIRED", "VOID"]),
      ),
    )
    .returning({ id: vouchers.id });

  if (updated.length > 0) {
    log.info("voucher marked refunded", { voucherId: voucher.id, source });
    return { kind: "voucher-refunded", voucherId: voucher.id };
  }

  // Lost a race: re-read to see what won.
  const fresh = await db.query.vouchers.findFirst({ where: eq(vouchers.id, voucher.id) });
  if (fresh?.status === "REDEEMED") {
    return { kind: "voucher-redeemed", voucherId: fresh.id, eventId: fresh.redeemed_event_id };
  }
  return { kind: "voucher-refunded", voucherId: voucher.id };
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

/** Whether a voucher can be redeemed right now. */
export function isRedeemable(voucher: Pick<VoucherRow, "status" | "expires_at">, now = new Date()): boolean {
  return voucher.status === "PURCHASED" && voucher.expires_at.getTime() > now.getTime();
}

/**
 * Throws the specific error for a voucher that cannot be redeemed. A
 * PURCHASED voucher past its expiry counts as expired even before the sweep
 * has flipped its status.
 */
export function assertRedeemable(voucher: Pick<VoucherRow, "status" | "expires_at">, now = new Date()): void {
  switch (voucher.status as VoucherStatus) {
    case "REDEEMED":
      throw new AppError(409, "This voucher has already been redeemed", "VOUCHER_ALREADY_REDEEMED");
    case "REFUNDED":
      throw new AppError(410, "This voucher was refunded", "VOUCHER_REFUNDED");
    case "VOID":
      throw new AppError(410, "This voucher is no longer valid", "VOUCHER_VOID");
    case "EXPIRED":
      throw new AppError(410, "This voucher has expired", "VOUCHER_EXPIRED");
    case "PURCHASED":
      if (voucher.expires_at.getTime() <= now.getTime()) {
        throw new AppError(410, "This voucher has expired", "VOUCHER_EXPIRED");
      }
      return;
    default:
      throw new AppError(410, "This voucher is no longer valid", "VOUCHER_VOID");
  }
}

export interface RedeemResult {
  eventId: string;
  eventCode: string;
  eventExpiresAt: Date;
  language: SupportedLanguage;
  emailSent: boolean;
}

/** Thrown inside the redemption transaction when the compare-and-swap loses. */
class RedemptionRaceLost extends Error {}

/**
 * Redeems a voucher: creates the event exactly as a paid game purchase would
 * (fresh event code, NOT_STARTED, 90-day window starting now) and links it to
 * the voucher.
 *
 * Atomic. The claim is `UPDATE … SET status = 'REDEEMED' WHERE status =
 * 'PURCHASED' AND expires_at > now()` inside the same transaction as the event
 * insert. Two concurrent redemptions serialise on the row lock; the second
 * re-evaluates the WHERE after the first commits, matches nothing, and is
 * refused with VOUCHER_ALREADY_REDEEMED. If the event insert fails the claim
 * rolls back with it, so a voucher is never marked redeemed without an event.
 */
export async function redeemVoucher(
  code: string,
  input: { language?: SupportedLanguage; email?: string; route_family_id?: string },
): Promise<RedeemResult> {
  const voucher = await db.query.vouchers.findFirst({ where: eq(vouchers.code, code) });
  if (!voucher) {
    throw new AppError(404, "Voucher not found", "VOUCHER_NOT_FOUND");
  }
  assertRedeemable(voucher);

  // Which hunt: the voucher's own family, else the redeemer's pick, else the
  // same default the homepage buy button uses.
  let familyId = voucher.route_family_id ?? input.route_family_id ?? null;
  if (!familyId) {
    familyId = (await resolveRouteFamilyId(undefined, undefined))?.familyId ?? null;
  }
  const language = (input.language ?? normaliseLanguage(voucher.language)) as SupportedLanguage;
  const route = familyId ? await resolveRouteInFamily(familyId, language) : null;
  if (!route) {
    log.error("no sellable route for voucher redemption", {
      voucherId: voucher.id,
      familyId,
      language,
    });
    throw new AppError(503, "No hunt is available for this voucher right now", "NO_HUNT_AVAILABLE");
  }

  const now = new Date();
  const eventExpiresAt = new Date(now.getTime());
  eventExpiresAt.setDate(eventExpiresAt.getDate() + EVENT_EXPIRY_DAYS);
  const buyerEmail = input.email ?? null;

  let created: { id: string; code: string };
  try {
    created = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(vouchers)
        .set({ status: "REDEEMED", redeemed_at: now })
        .where(
          and(
            eq(vouchers.id, voucher.id),
            eq(vouchers.status, "PURCHASED"),
            gt(vouchers.expires_at, now),
          ),
        )
        .returning({ id: vouchers.id });
      if (claimed.length === 0) throw new RedemptionRaceLost();

      let event: { id: string; code: string } | null = null;
      for (let attempt = 0; attempt < CODE_ATTEMPTS && !event; attempt++) {
        // ON CONFLICT DO NOTHING rather than catching the violation: an error
        // would abort the transaction and take the claim with it.
        const rows = await tx
          .insert(events)
          .values({
            code: generateEventCode(),
            status: "NOT_STARTED",
            route_id: route.id,
            route_family_id: route.route_family_id,
            language: route.language,
            // The voucher's payment: a refund of it reaches this event through
            // the existing charge.refunded path, and the admin refund button
            // on the event refunds the voucher purchase.
            stripe_payment_id: voucher.stripe_payment_id,
            buyer_email: buyerEmail,
            expires_at: eventExpiresAt,
          })
          .onConflictDoNothing({ target: events.code })
          .returning({ id: events.id, code: events.code });
        if (rows.length > 0) event = rows[0];
      }
      if (!event) {
        throw new AppError(500, "Failed to generate a unique event code", "CODE_GENERATION_FAILED");
      }

      await tx
        .update(vouchers)
        .set({ redeemed_event_id: event.id })
        .where(eq(vouchers.id, voucher.id));

      return event;
    });
  } catch (err) {
    if (err instanceof RedemptionRaceLost) {
      const fresh = await db.query.vouchers.findFirst({ where: eq(vouchers.id, voucher.id) });
      if (fresh) assertRedeemable(fresh, now);
      // Still PURCHASED yet unclaimable: it expired between the two reads.
      throw new AppError(409, "This voucher has already been redeemed", "VOUCHER_ALREADY_REDEEMED");
    }
    throw err;
  }

  log.info("voucher redeemed", { voucherId: voucher.id, eventId: created.id });

  let emailSent = false;
  if (buyerEmail) {
    const outcome = await sendEventCodeEmail({
      eventId: created.id,
      code: created.code,
      buyerEmail,
      language: route.language as SupportedLanguage,
      variant: "gift",
    });
    emailSent = outcome.sent;
  }

  return {
    eventId: created.id,
    eventCode: created.code,
    eventExpiresAt,
    language: route.language as SupportedLanguage,
    emailSent,
  };
}
