import { pgTable, uuid, varchar, integer, numeric, doublePrecision, boolean, jsonb, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { routeFamilies } from "./route-families.js";

/**
 * The practical facts about a route family, shown in the marketing site's
 * "Route at a glance" box (docs/plans/brand-direction-a.md, Phase 6).
 *
 * One row per family, created on the first save. A separate table rather
 * than columns on route_families because these are marketing content with
 * their own save and timestamp: the family row stays the small identity
 * record every route query joins, and "no row" cleanly means "nothing
 * entered yet". Every column is nullable: null means not checked, and the
 * site hides it.
 *
 * distance_km and duration_mins are canonical for marketing. The
 * per-language routes.estimated_* columns remain for the game's completion
 * message.
 */
export const routeFamilyFacts = pgTable("route_family_facts", {
  route_family_id: uuid("route_family_id")
    .primaryKey()
    .references(() => routeFamilies.id, { onDelete: "cascade" }),
  /** Start point name per language; `en` always set, others may be null. */
  start_label: jsonb("start_label").$type<Record<SupportedLanguage, string | null>>(),
  start_lat: doublePrecision("start_lat"),
  start_lng: doublePrecision("start_lng"),
  /** https://maps.google.com/?q=… */
  start_map_url: varchar("start_map_url", { length: 500 }),
  distance_km: numeric("distance_km", { precision: 5, scale: 2, mode: "number" }),
  duration_mins: integer("duration_mins"),
  stops: integer("stops"),
  step_free: varchar("step_free"),
  dogs: boolean("dogs"),
  toilets: varchar("toilets"),
  covered: varchar("covered"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // The start point is all or nothing: a label without a map pin (or the
  // other way round) is never shown.
  check(
    "route_family_facts_start_point_check",
    sql`(${table.start_label} IS NULL AND ${table.start_lat} IS NULL AND ${table.start_lng} IS NULL AND ${table.start_map_url} IS NULL) OR (${table.start_label} IS NOT NULL AND ${table.start_lat} IS NOT NULL AND ${table.start_lng} IS NOT NULL AND ${table.start_map_url} IS NOT NULL)`,
  ),
  check("route_family_facts_step_free_check", sql`${table.step_free} IN ('yes', 'mostly', 'no')`),
  check("route_family_facts_toilets_check", sql`${table.toilets} IN ('at_start', 'on_route', 'none')`),
  check("route_family_facts_covered_check", sql`${table.covered} IN ('none', 'some', 'most')`),
]);
