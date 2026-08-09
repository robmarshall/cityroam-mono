import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const routeFamilies = pgTable("route_families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  city: varchar("city").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
