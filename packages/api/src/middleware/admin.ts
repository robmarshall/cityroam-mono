import type { Context, MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import { ADMIN_API_KEY_SCOPES, type AdminApiKeyScope } from "@cityroam/shared/constants";
import { env } from "../env.js";
import { AppError } from "./error-handler.js";
import { isApiKeyToken, verifyApiKey } from "../lib/api-keys.js";
import { clientIp } from "../lib/client-ip.js";
import { createLogger } from "../lib/logger.js";
import { isAuditedMethod, writeAdminAuditLog } from "../lib/audit-log.js";
import {
  adminApiKeyRequestKind,
  checkAdminApiKeyRateLimit,
  checkInvalidAdminApiKeyRateLimit,
  recordInvalidAdminApiKeyAttempt,
} from "../redis/rate-limit.js";

const log = createLogger("admin-auth");

const JWT_EXPIRY_HOURS = 8;

/**
 * Who is calling an admin route. A session (the admin panel, signed in with
 * the admin password) holds every scope and may use session-only routes. An
 * API key holds only the scopes it was issued with.
 */
export interface AdminContext {
  kind: "session" | "api_key";
  /** Set for sessions. */
  username?: string;
  /** Set for API keys. */
  keyId?: string;
  keyName?: string;
  scopes: readonly AdminApiKeyScope[];
}

declare module "hono" {
  interface ContextVariableMap {
    admin: AdminContext;
  }
}

/** What a route demands beyond being an authenticated admin. */
export type AdminRequirement = AdminApiKeyScope | "session-only";

/**
 * Signs a JWT token for the admin user.
 */
export async function signAdminToken(username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: username,
    role: "admin",
    iat: now,
    exp: now + JWT_EXPIRY_HOURS * 60 * 60,
  };
  return await sign(payload, env.SESSION_SECRET);
}

function unauthorized(message = "Invalid or expired admin token"): AppError {
  return new AppError(401, message, "ADMIN_UNAUTHORIZED");
}

async function authenticate(c: Context, token: string): Promise<AdminContext> {
  if (isApiKeyToken(token)) {
    const ip = clientIp(c);

    // Checked before verification so a blocked IP costs no database read.
    const attempts = await checkInvalidAdminApiKeyRateLimit(ip);
    if (!attempts.allowed) {
      log.warn("admin api key attempts rate limited", { ip, attempts: attempts.current });
      c.header("Retry-After", String(attempts.retryAfterSeconds));
      throw new AppError(429, "Too many invalid API key attempts. Try again later.", "RATE_LIMITED");
    }

    const key = await verifyApiKey(token, { expectedEnv: env.API_KEY_ENV, ip });
    if (!key) {
      await recordInvalidAdminApiKeyAttempt(ip);
      log.warn("admin api key rejected", { ip, path: c.req.path });
      // One response for unknown id, wrong secret, revoked, expired and wrong
      // environment, so a caller learns nothing about which it was.
      throw unauthorized("Invalid, revoked or expired API key");
    }
    return { kind: "api_key", keyId: key.id, keyName: key.name, scopes: key.scopes };
  }

  let payload: Awaited<ReturnType<typeof verify>>;
  try {
    payload = await verify(token, env.SESSION_SECRET, "HS256");
  } catch {
    throw unauthorized();
  }
  if (payload.role !== "admin") {
    throw unauthorized("Invalid admin token");
  }
  return { kind: "session", username: String(payload.sub), scopes: ADMIN_API_KEY_SCOPES };
}

/**
 * Admin auth middleware. Accepts either the admin session JWT or an admin API
 * key (`Bearer crk_…`) and attaches the caller to `c.get("admin")`.
 *
 * - `requireAdmin()`               any authenticated admin
 * - `requireAdmin("routes:read")`  a session, or a key holding that scope
 * - `requireAdmin("session-only")` a session; every API key is refused
 *
 * 401 when there is no valid credential; 403 ADMIN_SESSION_REQUIRED or
 * ADMIN_SCOPE_REQUIRED when the credential is valid but not enough.
 *
 * API keys are rate limited per key (reads and writes separately) and failed
 * key attempts per IP; both limiters fail open when Redis is down, and the
 * credential check itself never depends on Redis. Every non-GET request by an
 * authenticated caller that does not end in a 5xx is written to the admin
 * audit log (sessions and keys alike, 4xx refusals included).
 */
export function requireAdmin(requirement?: AdminRequirement): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Admin authentication required", "ADMIN_UNAUTHORIZED");
    }

    const admin = await authenticate(c, authHeader.slice(7).trim());
    c.set("admin", admin);

    const audited = isAuditedMethod(c.req.method);
    const params = c.req.param() as Record<string, string>;
    let auditWritten = false;
    const audit = async (status: number) => {
      if (!audited || auditWritten || status >= 500) return;
      auditWritten = true;
      await writeAdminAuditLog(c, admin, status, params);
    };

    try {
      authorize(admin, requirement);
    } catch (err) {
      // A refused mutation by a known caller is worth a row too.
      if (err instanceof AppError) await audit(err.statusCode);
      throw err;
    }

    if (admin.kind === "api_key" && admin.keyId) {
      const kind = adminApiKeyRequestKind(c.req.method);
      const limit = await checkAdminApiKeyRateLimit(admin.keyId, kind);
      if (!limit.allowed) {
        // Not audited: a runaway client would otherwise turn every rejected
        // request into a database write, which is what the limit prevents.
        log.warn("admin api key rate limited", {
          key_id: admin.keyId,
          kind,
          requests: limit.current,
          limit: limit.limit,
        });
        c.header("Retry-After", String(limit.retryAfterSeconds));
        throw new AppError(
          429,
          `API key ${kind} rate limit exceeded (${limit.limit} per minute). Try again later.`,
          "RATE_LIMITED",
        );
      }
    }

    try {
      await next();
    } catch (err) {
      // Hono normally turns a handler error into a response before next()
      // returns; this covers an error that escapes anyway.
      if (err instanceof AppError) await audit(err.statusCode);
      throw err;
    }
    await audit(c.res.status);
  };
}

/** Throws 403 when a valid credential is not enough for the route. */
function authorize(admin: AdminContext, requirement: AdminRequirement | undefined): void {
  if (admin.kind !== "api_key") return;
  if (requirement === "session-only") {
    throw new AppError(
      403,
      "This endpoint requires a signed-in admin session; API keys cannot use it",
      "ADMIN_SESSION_REQUIRED",
    );
  }
  if (requirement && !admin.scopes.includes(requirement)) {
    throw new AppError(
      403,
      `This API key lacks the "${requirement}" scope`,
      "ADMIN_SCOPE_REQUIRED",
    );
  }
}

/** Session-only admin auth — for routes that never accept API keys. */
export const adminAuth: MiddlewareHandler = requireAdmin("session-only");

/** True when the current caller holds a scope (sessions hold them all). */
export function adminHasScope(c: Context, scope: AdminApiKeyScope): boolean {
  const admin = c.get("admin");
  if (!admin) return false;
  return admin.kind === "session" || admin.scopes.includes(scope);
}

/**
 * Activation is human-only: making a route sellable needs `routes:publish`,
 * which sessions hold and no API key can be granted. Creating an active route
 * or flipping is_active false -> true is refused; keeping an already-active
 * route active (a rename or copy edit on a live route) is allowed.
 */
export function assertCanActivate(c: Context, wasActive: boolean, willBeActive: boolean): void {
  if (willBeActive && !wasActive && !adminHasScope(c, "routes:publish")) {
    throw new AppError(
      403,
      'Activating a route requires the "routes:publish" scope, which only a signed-in admin holds. Create or save it with is_active: false.',
      "ADMIN_SCOPE_REQUIRED",
    );
  }
}
