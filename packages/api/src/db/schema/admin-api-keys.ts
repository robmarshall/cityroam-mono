import { pgTable, uuid, varchar, char, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Long-lived, scoped, revocable admin API keys (used by the route-authoring
 * MCP server). The token is `crk_<env>_<base62(id)>_<secret>`; only
 * sha256(secret) is stored, so a leaked table cannot be replayed. Revoked keys
 * are kept for the audit trail rather than deleted.
 */
export const adminApiKeys = pgTable("admin_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  /** `crk_<env>_<keyId>` — the non-secret part of the token, shown in lists. */
  prefix: varchar("prefix", { length: 64 }).notNull(),
  /** Hex sha256 of the secret part of the token. */
  token_hash: char("token_hash", { length: 64 }).notNull().unique(),
  last4: char("last4", { length: 4 }).notNull(),
  scopes: text("scopes").array().notNull(),
  created_by: varchar("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  last_used_ip: varchar("last_used_ip", { length: 64 }),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  revoked_by: varchar("revoked_by"),
});
