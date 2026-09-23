import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { adminApiKeyCreateSchema } from "@cityroam/shared/validation";
import {
  ADMIN_API_KEY_ENVS,
  ADMIN_API_KEY_SCOPES,
  type AdminApiKeyEnv,
  type AdminApiKeyScope,
} from "@cityroam/shared/constants";
import type {
  AdminApiKey,
  AdminApiKeyCreateResponse,
  AdminApiKeyListResponse,
  AdminApiKeyRevokeResponse,
  AdminAuditLogEntry,
  AdminAuditLogResponse,
} from "@cityroam/shared/types";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { adminApiKeys, adminAuditLog } from "../db/schema/index.js";
import { AppError } from "../middleware/error-handler.js";
import { requireAdmin } from "../middleware/admin.js";
import { generateApiKey } from "../lib/api-keys.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("admin-api-keys");

/**
 * Admin API key management and the admin audit log. Every route here is
 * session-only: a key can never mint, list or revoke keys, or read the trail
 * of what keys did.
 */
export const adminApiKeyRoutes = new Hono();

const sessionOnly = requireAdmin("session-only");

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_SCOPES = new Set<string>(ADMIN_API_KEY_SCOPES);

type ApiKeyRow = typeof adminApiKeys.$inferSelect;
type AuditRow = typeof adminAuditLog.$inferSelect;

/** The listable shape of a key. token_hash never leaves the database. */
function serializeKey(row: ApiKeyRow): AdminApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last4: row.last4,
    scopes: row.scopes.filter((s): s is AdminApiKeyScope => KNOWN_SCOPES.has(s)),
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
    last_used_at: row.last_used_at?.toISOString() ?? null,
    last_used_ip: row.last_used_ip ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
    revoked_by: row.revoked_by ?? null,
  };
}

function serializeAudit(row: AuditRow): AdminAuditLogEntry {
  return {
    id: row.id,
    created_at: row.created_at.toISOString(),
    actor_type: row.actor_type === "api_key" ? "api_key" : "session",
    actor_id: row.actor_id,
    actor_name: row.actor_name ?? null,
    method: row.method,
    path: row.path,
    params: row.params ?? null,
    status: row.status,
    ip: row.ip ?? null,
    request_id: row.request_id ?? null,
  };
}

function deploymentKeyEnv(): AdminApiKeyEnv {
  const value = env.API_KEY_ENV;
  if (!value || !(ADMIN_API_KEY_ENVS as readonly string[]).includes(value)) {
    throw new AppError(
      503,
      `API keys cannot be created: API_KEY_ENV is ${value ? `"${value}", not one of ${ADMIN_API_KEY_ENVS.join(", ")}` : "not set"} on this deployment.`,
      "API_KEY_ENV_UNSET",
    );
  }
  return value as AdminApiKeyEnv;
}

// GET /admin/api-keys — every key, newest first, without secrets.
adminApiKeyRoutes.get("/admin/api-keys", sessionOnly, async (c) => {
  const rows = await db.select().from(adminApiKeys).orderBy(desc(adminApiKeys.created_at));
  const response: AdminApiKeyListResponse = { api_keys: rows.map(serializeKey) };
  return c.json(response, 200);
});

// POST /admin/api-keys — mint a key. The token is in this response only.
adminApiKeyRoutes.post("/admin/api-keys", sessionOnly, async (c) => {
  const input = adminApiKeyCreateSchema.parse(await c.req.json());
  const keyEnv = deploymentKeyEnv();
  const admin = c.get("admin");

  const generated = generateApiKey(keyEnv);
  const expiresAt = input.expires_in_days
    ? new Date(Date.now() + input.expires_in_days * DAY_MS)
    : null;

  const [row] = await db
    .insert(adminApiKeys)
    .values({
      id: generated.id,
      name: input.name,
      prefix: generated.prefix,
      token_hash: generated.tokenHash,
      last4: generated.last4,
      scopes: input.scopes,
      created_by: admin.username ?? "admin",
      expires_at: expiresAt,
    })
    .returning();

  log.info("admin api key created", {
    key_id: row.id,
    name: row.name,
    scopes: row.scopes,
    created_by: row.created_by,
    expires_at: row.expires_at?.toISOString() ?? null,
  });

  c.header("Cache-Control", "no-store");
  const response: AdminApiKeyCreateResponse = {
    api_key: serializeKey(row),
    token: generated.token,
  };
  return c.json(response, 201);
});

const keyIdSchema = z.string().uuid("Invalid API key id");

// POST /admin/api-keys/:id/revoke — soft revoke. Idempotent: revoking a
// revoked key returns it unchanged (keeping the original revoked_at/by).
adminApiKeyRoutes.post("/admin/api-keys/:id/revoke", sessionOnly, async (c) => {
  const id = keyIdSchema.parse(c.req.param("id"));
  const admin = c.get("admin");

  const existing = await db.query.adminApiKeys.findFirst({ where: eq(adminApiKeys.id, id) });
  if (!existing) {
    throw new AppError(404, "API key not found", "API_KEY_NOT_FOUND");
  }

  let row = existing;
  if (!existing.revoked_at) {
    const [updated] = await db
      .update(adminApiKeys)
      .set({ revoked_at: new Date(), revoked_by: admin.username ?? "admin" })
      .where(and(eq(adminApiKeys.id, id), isNull(adminApiKeys.revoked_at)))
      .returning();
    if (updated) {
      row = updated;
      log.info("admin api key revoked", { key_id: id, revoked_by: updated.revoked_by });
    } else {
      // Lost a race with another revoke; report the stored state.
      row = (await db.query.adminApiKeys.findFirst({ where: eq(adminApiKeys.id, id) })) ?? existing;
    }
  }

  const response: AdminApiKeyRevokeResponse = { api_key: serializeKey(row) };
  return c.json(response, 200);
});

const auditQuerySchema = z.object({
  actor_id: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

// GET /admin/audit-log?actor_id=&limit=&offset= — newest first.
adminApiKeyRoutes.get("/admin/audit-log", sessionOnly, async (c) => {
  const { actor_id, limit, offset } = auditQuerySchema.parse(c.req.query());

  // One extra row says whether an older page exists.
  const rows = await db
    .select()
    .from(adminAuditLog)
    .where(actor_id ? eq(adminAuditLog.actor_id, actor_id) : undefined)
    .orderBy(desc(adminAuditLog.created_at), desc(adminAuditLog.id))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const response: AdminAuditLogResponse = {
    entries: rows.slice(0, limit).map(serializeAudit),
    next_offset: hasMore ? offset + limit : null,
  };
  return c.json(response, 200);
});
