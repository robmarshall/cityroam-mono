import { pgTable, uuid, varchar, integer, jsonb, timestamp, index, check, unique } from "drizzle-orm/pg-core";
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
  // A live event tracks its place with `events.current_block_index`, a plain
  // offset into this group's blocks ordered by position. Two blocks sharing a
  // position make that offset ambiguous, so the pairing is unique.
  //
  // The constraint is created DEFERRABLE INITIALLY DEFERRED by the migration —
  // drizzle's DSL cannot express that, so the SQL is hand-written. Deferring is
  // what lets the reorder / delete / move endpoints keep rewriting positions
  // with a single CASE update: the intermediate rows collide, the committed
  // ones never do.
  unique("route_blocks_group_id_position_unique").on(table.group_id, table.position),
]);
