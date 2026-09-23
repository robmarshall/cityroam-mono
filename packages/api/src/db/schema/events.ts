import { pgTable, uuid, varchar, integer, timestamp, index, uniqueIndex, check, boolean, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { routeFamilies } from "./route-families.js";
import { routes } from "./routes.js";
import { routeGroups } from "./route-groups.js";
import { routeBlocks } from "./route-blocks.js";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 8 }).unique().notNull(),
  status: varchar("status").notNull().default("NOT_STARTED"),
  route_id: uuid("route_id").notNull().references(() => routes.id),
  route_family_id: uuid("route_family_id").notNull().references(() => routeFamilies.id),
  language: varchar("language").notNull().default("en"),
  stripe_session_id: varchar("stripe_session_id"),
  stripe_payment_id: varchar("stripe_payment_id"),
  buyer_email: varchar("buyer_email"),
  lead_participant_id: uuid("lead_participant_id"),
  current_stop: integer("current_stop").notNull().default(0),
  current_group_id: uuid("current_group_id").references(() => routeGroups.id),
  current_block_id: uuid("current_block_id").references(() => routeBlocks.id),
  // Position within current_group_id's ordered blocks that the runner should
  // send next. Lets the startup reconciler resume a group stranded by a restart.
  current_block_index: integer("current_block_index").notNull().default(0),
  hints_given: integer("hints_given").notNull().default(0),
  wrong_attempts: integer("wrong_attempts").notNull().default(0),
  guide_response_count: integer("guide_response_count").notNull().default(0),
  hint_offered: boolean("hint_offered").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  refund_requested: boolean("refund_requested").notNull().default(false),
  refund_note: text("refund_note"),
  // Delivery state for the confirmation email that carries the event code.
  // The buyer has no other copy of the code once they close the success tab,
  // so a send that never lands has to be visible to an admin rather than only
  // present in a log line.
  code_email_sent_at: timestamp("code_email_sent_at", { withTimezone: true }),
  code_email_failed_at: timestamp("code_email_failed_at", { withTimezone: true }),
  code_email_error: text("code_email_error"),
}, (table) => [
  index("events_code_idx").on(table.code),
  index("events_status_idx").on(table.status),
  // One event per Stripe checkout session. NULLs stay distinct in Postgres, so
  // events created outside Stripe are unaffected.
  uniqueIndex("events_stripe_session_id_unique").on(table.stripe_session_id),
  check("events_status_check", sql`${table.status} IN ('NOT_STARTED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'REFUNDED')`),
]);
