import { pgTable, uuid, varchar, text, boolean, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const messageBanks = pgTable("message_banks", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type").notNull(),
  content: text("content").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("message_banks_type_idx").on(table.type),
  check("message_banks_type_check", sql`${table.type} IN ('success', 'failure', 'hint-exhausted', 'hint-offer', 'hint-decline', 'clarification', 'unknown-answer', 'completion', 'over-length')`),
]);
