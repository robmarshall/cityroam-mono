import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
}, (table) => [
  // Checkout picks the route for a purchase with
  //   family + language + is_active -> findFirst
  // (see resolveRouteInFamily in routes/checkout.ts). Two active rows for one
  // family and language make that pick arbitrary, so the uniqueness is scoped
  // to active rows only. Inactive duplicates are legitimate: old versions and
  // drafts of a translation are kept, they just cannot be sold.
  uniqueIndex("routes_family_language_active_unique")
    .on(table.route_family_id, table.language)
    .where(sql`is_active`),
]);
