import { pgTable, uuid, varchar, integer, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * One row per admin mutation (every non-GET admin request that authenticated
 * and did not fail with a 5xx), from both admin sessions and API keys. Written
 * by requireAdmin after the handler runs; see lib/audit-log.ts. The path is
 * stored scrubbed (no query string, no event codes or tokens). Pruned after
 * ADMIN_AUDIT_RETENTION_DAYS by the data-retention sweep.
 */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  actor_type: varchar("actor_type", { length: 16 }).notNull(),
  /** Admin username for sessions, key id for API keys. */
  actor_id: varchar("actor_id", { length: 100 }).notNull(),
  /** Admin username for sessions, key name for API keys. */
  actor_name: varchar("actor_name", { length: 100 }),
  method: varchar("method", { length: 10 }).notNull(),
  path: varchar("path", { length: 500 }).notNull(),
  params: jsonb("params").$type<Record<string, string>>(),
  status: integer("status").notNull(),
  ip: varchar("ip", { length: 64 }),
  request_id: varchar("request_id", { length: 100 }),
}, (table) => [
  index("admin_audit_log_actor_id_created_at_idx").on(table.actor_id, table.created_at),
  check("admin_audit_log_actor_type_check", sql`${table.actor_type} IN ('session', 'api_key')`),
]);
