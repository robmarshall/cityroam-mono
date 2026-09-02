import { pgTable, uuid, varchar, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { routes } from "./routes.js";

export const routeGroups = pgTable("route_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  route_id: uuid("route_id").notNull().references(() => routes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: varchar("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("route_groups_route_id_idx").on(table.route_id),
  // Same reasoning as route_blocks: the runner walks groups by position, so a
  // tie makes "the next stop" arbitrary. Created DEFERRABLE INITIALLY DEFERRED
  // by the migration so the reorder CASE update stays a single statement.
  unique("route_groups_route_id_position_unique").on(table.route_id, table.position),
]);
