import { pgTable, uuid, varchar, integer, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { routeGroups } from "./route-groups.js";

export const routeBlocks = pgTable("route_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  group_id: uuid("group_id").notNull().references(() => routeGroups.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  type: varchar("type").notNull(),
  config: jsonb("config").notNull(),
  delay_ms: integer("delay_ms").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("route_blocks_group_id_idx").on(table.group_id),
  check("route_blocks_type_check", sql`${table.type} IN ('message', 'image', 'question', 'action', 'map')`),
]);
