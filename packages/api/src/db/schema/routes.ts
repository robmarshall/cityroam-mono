import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { routeFamilies } from "./route-families.js";

export const routes = pgTable("routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  description: text("description"),
  language: varchar("language").notNull().default("en"),
  route_family_id: uuid("route_family_id").notNull().references(() => routeFamilies.id),
  total_stops: integer("total_stops").notNull(),
  estimated_duration_mins: integer("estimated_duration_mins").notNull(),
  estimated_distance_km: decimal("estimated_distance_km").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
