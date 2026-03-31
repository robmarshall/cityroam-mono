import { pgTable, uuid, varchar, integer, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events } from "./events.js";
import { participants } from "./participants.js";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  event_id: uuid("event_id").notNull().references(() => events.id),
  step_number: integer("step_number").notNull(),
  sender_type: varchar("sender_type").notNull(),
  sender_name: varchar("sender_name").notNull(),
  participant_id: uuid("participant_id").references(() => participants.id),
  content: text("content").notNull(),
  image_url: varchar("image_url"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("messages_event_id_created_at_idx").on(table.event_id, table.created_at),
  check("messages_sender_type_check", sql`${table.sender_type} IN ('user', 'guide', 'system', 'dropped')`),
]);
