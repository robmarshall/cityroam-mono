import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp } from "drizzle-orm/pg-core";

export const routes = pgTable("routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  city: varchar("city").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  total_stops: integer("total_stops").notNull(),
  estimated_duration_mins: integer("estimated_duration_mins").notNull(),
  estimated_distance_km: decimal("estimated_distance_km").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
