import { and, asc, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminAuditLog, events, messages, participants, vouchers } from "../db/schema/index.js";
import { redis } from "../redis/client.js";
import { createLogger } from "../lib/logger.js";

/**
 * Enforces the retention periods promised on the marketing privacy page
 * ("How long we keep it", packages/marketing/messages/en.json → legal.privacy):
 *
 *  - "Event, participant and chat records: 12 months after the hunt is
 *    completed, refunded or expires, then deleted or anonymised."
 *    → chat messages and participant rows (display names, session tokens) are
 *      deleted; the event row is kept but its PII (buyer email, refund note,
 *      email delivery error, lead pointer) is nulled.
 *
 *  - "Purchase and accounting records: 6 years, as UK tax law requires."
 *    → the event row keeps its Stripe references until 6 years after purchase,
 *      then those are nulled too. The anonymised row (code, route, status,
 *      timings, counters) stays as non-personal gameplay data.
 *
 * Gift vouchers follow the same two periods. The privacy page does not
 * mention vouchers yet (flagged for the solicitor in docs/vouchers.md), so the
 * event periods are applied by analogy:
 *
 *  - 12 months after the voucher ends (redeemed, refunded, voided or expired)
 *    → purchaser email, recipient name, gift message, void reason and email
 *      delivery error are nulled. The code, status and dates stay.
 *  - 6 years after purchase → the Stripe references are nulled.
 *
 * The redeemer's email, if they gave one, lives on the event row and goes
 * with the event's own retention.
 *
 * It also prunes the admin audit log (admin_audit_log) after
 * ADMIN_AUDIT_RETENTION_DAYS: the rows name admin sessions and API keys and
 * carry client IPs, and six months is enough to investigate a misused key.
 *
 * Every step is keyed on "still has the data", so re-running is a no-op, and
 * each pass works in bounded batches. Runs in the HTTP process only, beside the
 * expiry sweep, and a Redis lock stops two HTTP replicas running it together.
 */

const log = createLogger("data-retention");

export const EVENT_RETENTION_MONTHS = 12;
export const ACCOUNTING_RETENTION_YEARS = 6;
export const ADMIN_AUDIT_RETENTION_DAYS = 180;

/** Events processed per transaction. */
export const RETENTION_BATCH_SIZE = 200;
/** Cap per pass so a large backlog cannot hold the lock indefinitely. */
export const MAX_BATCHES_PER_RUN = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = DAY_MS;

const LOCK_KEY = "data-retention:lock";
const LOCK_TTL_SECONDS = 30 * 60;

const TERMINAL_STATUSES = ["COMPLETED", "EXPIRED", "REFUNDED"];

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export interface RetentionResult {
  anonymisedEvents: number;
  deletedMessages: number;
  deletedParticipants: number;
  strippedPaymentRefs: number;
  prunedAuditRows: number;
  anonymisedVouchers: number;
  strippedVoucherPaymentRefs: number;
}

/** Subtract calendar months (UTC), e.g. for "12 months after". */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function eventRetentionCutoff(now = new Date()): Date {
  return monthsBefore(now, EVENT_RETENTION_MONTHS);
}

export function accountingRetentionCutoff(now = new Date()): Date {
  return monthsBefore(now, ACCOUNTING_RETENTION_YEARS * 12);
}

/**
 * When the hunt "ended" for retention purposes.
 *
 *  - COMPLETED: completed_at (expires_at for legacy rows missing it).
 *  - EXPIRED:   expires_at.
 *  - REFUNDED:  there is no refunded_at column, so use the latest timestamp we
 *               have (purchase, expiry or completion). A refund landing after
 *               expiry is anchored slightly early, but only chat/participant
 *               data goes — the payment references survive for 6 years.
 */
export function retentionAnchor(): SQL {
  return sql`(CASE ${events.status}
    WHEN 'COMPLETED' THEN COALESCE(${events.completed_at}, ${events.expires_at})
    WHEN 'EXPIRED' THEN ${events.expires_at}
    ELSE GREATEST(${events.created_at}, ${events.expires_at}, COALESCE(${events.completed_at}, ${events.created_at}))
  END)`;
}

export function adminAuditRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - ADMIN_AUDIT_RETENTION_DAYS * DAY_MS);
}

/**
 * Events past the 12-month window that still hold anything personal. The
 * "still holds" half is what makes the sweep idempotent.
 */
export function anonymiseCandidateFilter(cutoff: Date): SQL | undefined {
  return and(
    inArray(events.status, TERMINAL_STATUSES),
    sql`${retentionAnchor()} < ${cutoff.toISOString()}`,
    or(
      isNotNull(events.buyer_email),
      isNotNull(events.refund_note),
      isNotNull(events.code_email_error),
      isNotNull(events.lead_participant_id),
      sql`EXISTS (SELECT 1 FROM "participants" WHERE "participants"."event_id" = "events"."id")`,
      sql`EXISTS (SELECT 1 FROM "messages" WHERE "messages"."event_id" = "events"."id")`,
    ),
  );
}

/** Events older than the accounting window that still carry Stripe references. */
export function paymentRefCandidateFilter(cutoff: Date): SQL | undefined {
  return and(
    lt(events.created_at, cutoff),
    or(isNotNull(events.stripe_session_id), isNotNull(events.stripe_payment_id)),
  );
}

/**
 * Anonymise one batch of events past the 12-month window. Returns the counts,
 * with `events === 0` meaning there is nothing left to do.
 */
export async function anonymiseExpiredEventBatch(
  now = new Date(),
): Promise<{ events: number; messages: number; participants: number }> {
  const candidates = await db
    .select({ id: events.id })
    .from(events)
    .where(anonymiseCandidateFilter(eventRetentionCutoff(now)))
    .orderBy(events.created_at)
    .limit(RETENTION_BATCH_SIZE);

  if (candidates.length === 0) return { events: 0, messages: 0, participants: 0 };

  const ids = candidates.map((c) => c.id);

  return db.transaction(async (tx) => {
    // messages reference participants, so they go first.
    const deletedMessages = await tx
      .delete(messages)
      .where(inArray(messages.event_id, ids))
      .returning({ id: messages.id });

    const deletedParticipants = await tx
      .delete(participants)
      .where(inArray(participants.event_id, ids))
      .returning({ id: participants.id });

    const updated = await tx
      .update(events)
      .set({
        buyer_email: null,
        refund_note: null,
        code_email_error: null,
        lead_participant_id: null,
      })
      .where(inArray(events.id, ids))
      .returning({ id: events.id });

    return {
      events: updated.length,
      messages: deletedMessages.length,
      participants: deletedParticipants.length,
    };
  });
}

/** Null the Stripe references on one batch of events past the accounting window. */
export async function stripPaymentRefBatch(now = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: events.id })
    .from(events)
    .where(paymentRefCandidateFilter(accountingRetentionCutoff(now)))
    .orderBy(events.created_at)
    .limit(RETENTION_BATCH_SIZE);

  if (candidates.length === 0) return 0;

  const updated = await db
    .update(events)
    .set({ stripe_session_id: null, stripe_payment_id: null })
    .where(inArray(events.id, candidates.map((c) => c.id)))
    .returning({ id: events.id });

  return updated.length;
}

/** Delete one batch of admin audit rows older than the retention window. */
export async function pruneAdminAuditLogBatch(now = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: adminAuditLog.id })
    .from(adminAuditLog)
    .where(lt(adminAuditLog.created_at, adminAuditRetentionCutoff(now)))
    .orderBy(asc(adminAuditLog.created_at))
    .limit(RETENTION_BATCH_SIZE);

  if (candidates.length === 0) return 0;

  const deleted = await db
    .delete(adminAuditLog)
    .where(inArray(adminAuditLog.id, candidates.map((c) => c.id)))
    .returning({ id: adminAuditLog.id });

  return deleted.length;
}

const TERMINAL_VOUCHER_STATUSES = ["REDEEMED", "REFUNDED", "VOID", "EXPIRED"];

/**
 * When a voucher "ended" for retention purposes: the redemption, refund or
 * void date, or the expiry date. COALESCE to expires_at covers rows missing
 * the specific timestamp.
 */
export function voucherRetentionAnchor(): SQL {
  return sql`(CASE ${vouchers.status}
    WHEN 'REDEEMED' THEN COALESCE(${vouchers.redeemed_at}, ${vouchers.expires_at})
    WHEN 'REFUNDED' THEN COALESCE(${vouchers.refunded_at}, ${vouchers.created_at})
    WHEN 'VOID' THEN COALESCE(${vouchers.voided_at}, ${vouchers.created_at})
    ELSE ${vouchers.expires_at}
  END)`;
}

/** Ended vouchers past the 12-month window that still hold personal data. */
export function voucherAnonymiseCandidateFilter(cutoff: Date): SQL | undefined {
  return and(
    inArray(vouchers.status, TERMINAL_VOUCHER_STATUSES),
    sql`${voucherRetentionAnchor()} < ${cutoff.toISOString()}`,
    or(
      isNotNull(vouchers.purchaser_email),
      isNotNull(vouchers.recipient_name),
      isNotNull(vouchers.message),
      isNotNull(vouchers.void_reason),
      isNotNull(vouchers.email_error),
    ),
  );
}

/** Vouchers older than the accounting window that still carry Stripe references. */
export function voucherPaymentRefCandidateFilter(cutoff: Date): SQL | undefined {
  return and(
    lt(vouchers.created_at, cutoff),
    or(isNotNull(vouchers.stripe_session_id), isNotNull(vouchers.stripe_payment_id)),
  );
}

/** Null the personal fields on one batch of ended vouchers. */
export async function anonymiseVoucherBatch(now = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(voucherAnonymiseCandidateFilter(eventRetentionCutoff(now)))
    .orderBy(vouchers.created_at)
    .limit(RETENTION_BATCH_SIZE);

  if (candidates.length === 0) return 0;

  const updated = await db
    .update(vouchers)
    .set({
      purchaser_email: null,
      recipient_name: null,
      message: null,
      void_reason: null,
      email_error: null,
    })
    .where(inArray(vouchers.id, candidates.map((c) => c.id)))
    .returning({ id: vouchers.id });

  return updated.length;
}

/** Null the Stripe references on one batch of vouchers past the accounting window. */
export async function stripVoucherPaymentRefBatch(now = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(voucherPaymentRefCandidateFilter(accountingRetentionCutoff(now)))
    .orderBy(vouchers.created_at)
    .limit(RETENTION_BATCH_SIZE);

  if (candidates.length === 0) return 0;

  const updated = await db
    .update(vouchers)
    .set({ stripe_session_id: null, stripe_payment_id: null })
    .where(inArray(vouchers.id, candidates.map((c) => c.id)))
    .returning({ id: vouchers.id });

  return updated.length;
}

/**
 * Run a full retention pass. Loops each step in batches until a batch comes
 * back short or the per-run cap is hit (the next pass picks up the rest).
 */
export async function runRetentionSweep(now = new Date()): Promise<RetentionResult> {
  const result: RetentionResult = {
    anonymisedEvents: 0,
    deletedMessages: 0,
    deletedParticipants: 0,
    strippedPaymentRefs: 0,
    prunedAuditRows: 0,
    anonymisedVouchers: 0,
    strippedVoucherPaymentRefs: 0,
  };

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const batch = await anonymiseExpiredEventBatch(now);
    result.anonymisedEvents += batch.events;
    result.deletedMessages += batch.messages;
    result.deletedParticipants += batch.participants;
    if (batch.events < RETENTION_BATCH_SIZE) break;
  }

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const stripped = await stripPaymentRefBatch(now);
    result.strippedPaymentRefs += stripped;
    if (stripped < RETENTION_BATCH_SIZE) break;
  }

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const pruned = await pruneAdminAuditLogBatch(now);
    result.prunedAuditRows += pruned;
    if (pruned < RETENTION_BATCH_SIZE) break;
  }

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const anonymised = await anonymiseVoucherBatch(now);
    result.anonymisedVouchers += anonymised;
    if (anonymised < RETENTION_BATCH_SIZE) break;
  }

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const stripped = await stripVoucherPaymentRefBatch(now);
    result.strippedVoucherPaymentRefs += stripped;
    if (stripped < RETENTION_BATCH_SIZE) break;
  }

  const touched =
    result.anonymisedEvents + result.deletedMessages +
    result.deletedParticipants + result.strippedPaymentRefs +
    result.prunedAuditRows + result.anonymisedVouchers +
    result.strippedVoucherPaymentRefs;
  if (touched > 0) {
    log.info("retention sweep applied", { ...result });
  }

  return result;
}

/**
 * Run a sweep under a cross-process lock. Returns null when another process
 * already holds the lock.
 */
export async function runLockedRetentionSweep(): Promise<RetentionResult | null> {
  const claimed = await redis.set(LOCK_KEY, String(process.pid), "EX", LOCK_TTL_SECONDS, "NX");
  if (claimed !== "OK") return null;

  try {
    return await runRetentionSweep();
  } finally {
    await redis.del(LOCK_KEY).catch(() => undefined);
  }
}

function runAndLog(): void {
  runLockedRetentionSweep().catch((err) =>
    log.error("retention sweep failed", {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}

/**
 * Start the daily retention sweep. Runs once on startup, then every 24 hours.
 * Safe to call multiple times — only one timer will be active.
 */
export function startRetentionSweep(): void {
  if (sweepTimer) return;

  runAndLog();
  sweepTimer = setInterval(runAndLog, SWEEP_INTERVAL_MS);

  log.info("retention sweep started", {
    interval_hours: SWEEP_INTERVAL_MS / (60 * 60 * 1000),
    event_retention_months: EVENT_RETENTION_MONTHS,
    accounting_retention_years: ACCOUNTING_RETENTION_YEARS,
    admin_audit_retention_days: ADMIN_AUDIT_RETENTION_DAYS,
  });
}

/** Stop the retention sweep (used during graceful shutdown). */
export function stopRetentionSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
