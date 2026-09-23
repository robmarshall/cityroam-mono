import type { Context } from "hono";
import { db } from "../db/index.js";
import { adminAuditLog } from "../db/schema/index.js";
import type { AdminContext } from "../middleware/admin.js";
import { clientIp } from "./client-ip.js";
import { createLogger } from "./logger.js";

const log = createLogger("audit-log");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Path segments after these hold event codes (bearer credentials for a hunt). */
const CODE_PARENTS = new Set(["event", "events", "ws"]);
/** Route params whose values are credentials rather than identifiers. */
const SECRET_PARAMS = /^(code|event_code|token|session|session_id|secret|key)$/i;
const REDACTED = "[redacted]";

const MAX_PATH = 500;
const MAX_PARAM = 200;

/**
 * The request path as stored in the audit log: no query string, no API key
 * tokens, and no event codes (a segment after /event/, /events/ or /ws/ that
 * is not a UUID is treated as a code). Admin routes address events by UUID, so
 * those survive and the row still says which event was touched.
 */
export function scrubAuditPath(rawPath: string): string {
  const path = rawPath.split(/[?#]/, 1)[0] ?? "";
  const segments = path.split("/");
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const parent = segments[i - 1]?.toLowerCase();
    if (seg.toLowerCase().startsWith("crk_")) {
      segments[i] = REDACTED;
    } else if (parent && CODE_PARENTS.has(parent) && !UUID.test(seg)) {
      segments[i] = REDACTED;
    }
  }
  return segments.join("/").slice(0, MAX_PATH);
}

/** Route params for the audit row, with credential-like values redacted. */
export function scrubAuditParams(params: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    if (SECRET_PARAMS.test(name) || value.toLowerCase().startsWith("crk_")) {
      out[name] = REDACTED;
    } else {
      out[name] = value.slice(0, MAX_PARAM);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Mutations are audited; reads (GET/HEAD/OPTIONS) are not. */
export function isAuditedMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

function requestId(c: Context): string | null {
  const id =
    c.req.header("x-request-id") ??
    c.req.header("cf-ray") ??
    c.req.header("x-amzn-trace-id") ??
    null;
  return id ? id.slice(0, 100) : null;
}

/**
 * Writes one audit row for an admin mutation. Never throws: a failed write is
 * logged and the request carries on, because the audit trail must not become
 * a way to take the admin API down.
 */
export async function writeAdminAuditLog(
  c: Context,
  admin: AdminContext,
  status: number,
  params: Record<string, string>,
): Promise<void> {
  try {
    const isKey = admin.kind === "api_key";
    await db.insert(adminAuditLog).values({
      actor_type: admin.kind,
      actor_id: ((isKey ? admin.keyId : admin.username) ?? "unknown").slice(0, 100),
      actor_name: ((isKey ? admin.keyName : admin.username) ?? null)?.slice(0, 100) ?? null,
      method: c.req.method.toUpperCase().slice(0, 10),
      path: scrubAuditPath(c.req.path),
      params: scrubAuditParams(params),
      status,
      ip: clientIp(c),
      request_id: requestId(c),
    });
  } catch (err) {
    log.error("failed to write admin audit log", {
      method: c.req.method,
      path: scrubAuditPath(c.req.path),
      status,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
