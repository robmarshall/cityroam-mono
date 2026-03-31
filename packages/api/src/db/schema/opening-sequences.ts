import { pgTable, uuid, varchar, boolean, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const openingSequences = pgTable("opening_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const openingSequenceItems = pgTable("opening_sequence_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequence_id: uuid("sequence_id").notNull().references(() => openingSequences.id, { onDelete: "cascade" }),
  sort_order: integer("sort_order").notNull(),
  content: text("content").notNull().default(""),
  image_url: text("image_url"),
  delay_ms: integer("delay_ms").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("opening_sequence_items_sequence_id_idx").on(table.sequence_id),
]);
