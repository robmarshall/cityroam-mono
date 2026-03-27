import { pgTable, uuid, varchar, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { routes } from "./routes.js";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 8 }).unique().notNull(),
  status: varchar("status").notNull().default("NOT_STARTED"),
  route_id: uuid("route_id").notNull().references(() => routes.id),
  stripe_session_id: varchar("stripe_session_id"),
  stripe_payment_id: varchar("stripe_payment_id"),
  buyer_email: varchar("buyer_email"),
  lead_participant_id: uuid("lead_participant_id"),
  current_stop: integer("current_stop").notNull().default(0),
  hints_given: integer("hints_given").notNull().default(0),
  wrong_attempts: integer("wrong_attempts").notNull().default(0),
  guide_response_count: integer("guide_response_count").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("events_code_idx").on(table.code),
  index("events_status_idx").on(table.status),
  check("events_status_check", sql`${table.status} IN ('NOT_STARTED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED')`),
]);
