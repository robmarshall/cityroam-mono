import { pgTable, uuid, varchar, boolean, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events } from "./events.js";

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  event_id: uuid("event_id").notNull().references(() => events.id),
  display_name: varchar("display_name", { length: 30 }).notNull(),
  token: varchar("token").notNull().unique(),
  is_lead: boolean("is_lead").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  joined_at: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  left_at: timestamp("left_at", { withTimezone: true }),
  left_reason: varchar("left_reason"),
}, (table) => [
  index("participants_event_id_idx").on(table.event_id),
  index("participants_token_idx").on(table.token),
  check("participants_left_reason_check", sql`${table.left_reason} IS NULL OR ${table.left_reason} IN ('voluntary', 'timeout')`),
]);
