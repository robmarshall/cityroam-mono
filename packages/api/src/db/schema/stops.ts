import { pgTable, uuid, varchar, integer, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { routes } from "./routes.js";

export const stops = pgTable("stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  route_id: uuid("route_id").notNull().references(() => routes.id),
  stop_number: integer("stop_number").notNull(),
  name: varchar("name").notNull(),
  directions_from_previous: text("directions_from_previous").notNull(),
  clue: text("clue").notNull(),
  accepted_answers: jsonb("accepted_answers").notNull(),
  hints: jsonb("hints").notNull(),
  correct_response: text("correct_response"),
  fun_fact: text("fun_fact").notNull(),
  images: jsonb("images").notNull().default([]),
  google_maps_link: varchar("google_maps_link"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("stops_route_id_stop_number_unique").on(table.route_id, table.stop_number),
]);
