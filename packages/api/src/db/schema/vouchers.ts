import { pgTable, uuid, varchar, integer, timestamp, text, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { routeFamilies } from "./route-families.js";
import { events } from "./events.js";

/**
 * Gift vouchers. A voucher is bought through Stripe like a game but creates no
 * event; the event (and its 90-day window) only exists once someone redeems
 * the code. Personal fields are nulled by the retention sweep 12 months after
 * the voucher ends; the Stripe references stay for the 6-year accounting
 * window.
 */
export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Canonical XXXX-XXXX-XX form (see normalizeVoucherCode). */
  code: varchar("code", { length: 12 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("PURCHASED"),
  purchaser_email: varchar("purchaser_email", { length: 254 }),
  recipient_name: varchar("recipient_name", { length: 60 }),
  message: varchar("message", { length: 300 }),
  /** Language of the voucher email and the default redemption language. */
  language: varchar("language", { length: 5 }).notNull().default("en"),
  /** null: redeemable for any route family. */
  route_family_id: uuid("route_family_id").references(() => routeFamilies.id, { onDelete: "set null" }),
  /** Amount paid in the currency's minor unit, as Stripe reported it. */
  amount_total: integer("amount_total"),
  currency: varchar("currency", { length: 3 }),
  stripe_session_id: varchar("stripe_session_id"),
  stripe_payment_id: varchar("stripe_payment_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemed_at: timestamp("redeemed_at", { withTimezone: true }),
  redeemed_event_id: uuid("redeemed_event_id").references(() => events.id, { onDelete: "set null" }),
  refunded_at: timestamp("refunded_at", { withTimezone: true }),
  voided_at: timestamp("voided_at", { withTimezone: true }),
  void_reason: text("void_reason"),
  // Delivery state of the email that carries the code, mirroring the
  // event-code email columns on events.
  email_sent_at: timestamp("email_sent_at", { withTimezone: true }),
  email_failed_at: timestamp("email_failed_at", { withTimezone: true }),
  email_error: text("email_error"),
}, (table) => [
  uniqueIndex("vouchers_code_unique").on(table.code),
  // One voucher per checkout session: the webhook's idempotency key.
  uniqueIndex("vouchers_stripe_session_id_unique").on(table.stripe_session_id),
  // A redemption creates exactly one event, and an event comes from at most one voucher.
  uniqueIndex("vouchers_redeemed_event_id_unique").on(table.redeemed_event_id),
  index("vouchers_stripe_payment_id_idx").on(table.stripe_payment_id),
  index("vouchers_status_idx").on(table.status),
  check("vouchers_status_check", sql`${table.status} IN ('PURCHASED', 'REDEEMED', 'REFUNDED', 'EXPIRED', 'VOID')`),
]);
