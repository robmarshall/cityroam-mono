import {
  GUIDE_RATE_LIMIT_MS,
  PARTICIPANT_RATE_LIMIT_COUNT,
  PARTICIPANT_RATE_LIMIT_WINDOW_MS,
} from "@cityroam/shared/constants";
import { redis } from "./client.js";
import { createLogger } from "../lib/logger.js";

const rateLimitLog = createLogger("rate-limit");

interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
}

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local count = redis.call("INCR", key)
if count == 1 then
  redis.call("EXPIRE", key, window)
end
return count
`;

async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const count = (await redis.eval(
    RATE_LIMIT_LUA,
    1,
    key,
    String(limit),
    String(windowSeconds),
  )) as number;
  return { allowed: count <= limit, current: count, limit };
}

export async function checkJoinRateLimit(
  code: string,
): Promise<RateLimitResult> {
  return checkRateLimit(`ratelimit:join:${code}`, 20, 60_000);
}

export async function checkGuideRateLimit(
  code: string,
): Promise<RateLimitResult> {
  return checkRateLimit(
    `ratelimit:guide:${code}`,
    1,
    GUIDE_RATE_LIMIT_MS,
  );
}

/**
 * How often the guide may tell a group it is busy. Much coarser than the
 * guide limit itself: once the shared limit is blocking replies every member
 * of a chatty group would otherwise get their own hold-on line, which is the
 * exact noise the guide limit exists to prevent.
 */
const GUIDE_BUSY_NOTICE_MS = 30 * 1000;

export async function checkGuideBusyNoticeRateLimit(
  code: string,
): Promise<RateLimitResult> {
  return checkRateLimit(
    `ratelimit:guide-busy:${code}`,
    1,
    GUIDE_BUSY_NOTICE_MS,
  );
}

export async function checkParticipantRateLimit(
  code: string,
  participantId: string,
): Promise<RateLimitResult> {
  return checkRateLimit(
    `ratelimit:participant:${code}:${participantId}`,
    PARTICIPANT_RATE_LIMIT_COUNT,
    PARTICIPANT_RATE_LIMIT_WINDOW_MS,
  );
}

export async function checkNameChangeRateLimit(
  code: string,
  participantId: string,
): Promise<RateLimitResult> {
  return checkRateLimit(
    `ratelimit:namechange:${code}:${participantId}`,
    3,
    86_400_000,
  );
}

// ---------------------------------------------------------------------------
// Admin login brute-force limiter
// ---------------------------------------------------------------------------
/**
 * Admin login is a single shared username/password that unlocks route CRUD and
 * Stripe refunds for eight hours, so it gets its own much tighter limiter than
 * the gameplay ones: a handful of tries per quarter hour, per client IP.
 */
export const ADMIN_LOGIN_LIMIT = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface LoginRateLimitResult extends RateLimitResult {
  /** Seconds until the window resets. 0 when the request was allowed. */
  retryAfterSeconds: number;
}

/**
 * INCR plus the key's remaining TTL, so a blocked caller can be told how long
 * to wait without a second round trip.
 */
const RATE_LIMIT_WITH_TTL_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local count = redis.call("INCR", key)
if count == 1 then
  redis.call("EXPIRE", key, window)
end
return { count, redis.call("TTL", key) }
`;

function adminLoginKey(clientIp: string): string {
  return `ratelimit:adminlogin:${clientIp}`;
}

/**
 * Counts an admin login attempt.
 *
 * Fails open — a Redis outage logs an error and lets the attempt through
 * rather than locking the operator out of their own admin panel. The password
 * check itself is unaffected, so an outage widens the brute-force window
 * rather than granting access.
 */
export async function checkAdminLoginRateLimit(
  clientIp: string,
): Promise<LoginRateLimitResult> {
  const windowSeconds = Math.ceil(ADMIN_LOGIN_WINDOW_MS / 1000);

  try {
    const [countRaw, ttlRaw] = (await redis.eval(
      RATE_LIMIT_WITH_TTL_LUA,
      1,
      adminLoginKey(clientIp),
      String(windowSeconds),
    )) as [number, number];

    const current = Number(countRaw);
    const ttl = Number(ttlRaw);
    const allowed = current <= ADMIN_LOGIN_LIMIT;

    return {
      allowed,
      current,
      limit: ADMIN_LOGIN_LIMIT,
      retryAfterSeconds: allowed ? 0 : ttl > 0 ? ttl : windowSeconds,
    };
  } catch (err) {
    rateLimitLog.error("admin login rate limit unavailable — failing open", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      allowed: true,
      current: 0,
      limit: ADMIN_LOGIN_LIMIT,
      retryAfterSeconds: 0,
    };
  }
}

/**
 * Drops the attempt counter after a successful login, so one operator
 * fat-fingering their password a few times does not leave the window
 * half-spent for the rest of the quarter hour.
 */
export async function clearAdminLoginRateLimit(clientIp: string): Promise<void> {
  try {
    await redis.del(adminLoginKey(clientIp));
  } catch (err) {
    rateLimitLog.warn("failed to clear admin login rate limit", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Admin API key limiters
// ---------------------------------------------------------------------------
/**
 * Per-key request budget for admin API keys, in fixed one-minute windows.
 * Writes get a much smaller budget than reads: a runaway MCP client re-issuing
 * block edits in a loop is the failure this exists to contain.
 */
export const ADMIN_API_KEY_READ_LIMIT = 300;
export const ADMIN_API_KEY_WRITE_LIMIT = 60;
export const ADMIN_API_KEY_WINDOW_MS = 60 * 1000;

/**
 * Failed API key authentications per client IP. Secrets carry 256 bits of
 * entropy so guessing is hopeless anyway; this keeps a scanner from turning
 * every guess into a database read.
 */
export const ADMIN_API_KEY_INVALID_LIMIT = 20;
export const ADMIN_API_KEY_INVALID_WINDOW_MS = 15 * 60 * 1000;

export type AdminApiKeyRequestKind = "read" | "write";

/** Reads count against the read budget; every other method is a write. */
export function adminApiKeyRequestKind(method: string): AdminApiKeyRequestKind {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS" ? "read" : "write";
}

function adminApiKeyBucket(keyId: string, kind: AdminApiKeyRequestKind): string {
  return `ratelimit:adminkey:${kind}:${keyId}`;
}

function adminApiKeyInvalidBucket(clientIp: string): string {
  return `ratelimit:adminkey-invalid:${clientIp}`;
}

/** Reads a counter and its TTL without incrementing it. */
const PEEK_WITH_TTL_LUA = `
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
return { count, redis.call("TTL", KEYS[1]) }
`;

/**
 * Normalises an eval reply of `{ count, ttl }`. A bare number (older mocks,
 * or a script returning only the count) is read as a count with no TTL.
 */
function readCountAndTtl(reply: unknown): { count: number; ttl: number } {
  if (Array.isArray(reply)) {
    return { count: Number(reply[0]) || 0, ttl: Number(reply[1]) };
  }
  return { count: Number(reply) || 0, ttl: -1 };
}

function retryAfter(ttl: number, windowSeconds: number): number {
  return ttl > 0 ? ttl : windowSeconds;
}

/**
 * Counts one request by an admin API key against its read or write budget.
 *
 * Fails open like the login limiter: a Redis outage logs an error and lets the
 * request through. Authentication itself is database-backed, so an outage
 * removes the throttle but never grants access.
 */
export async function checkAdminApiKeyRateLimit(
  keyId: string,
  kind: AdminApiKeyRequestKind,
): Promise<LoginRateLimitResult> {
  const limit = kind === "read" ? ADMIN_API_KEY_READ_LIMIT : ADMIN_API_KEY_WRITE_LIMIT;
  const windowSeconds = Math.ceil(ADMIN_API_KEY_WINDOW_MS / 1000);

  try {
    const { count, ttl } = readCountAndTtl(
      await redis.eval(
        RATE_LIMIT_WITH_TTL_LUA,
        1,
        adminApiKeyBucket(keyId, kind),
        String(windowSeconds),
      ),
    );
    const allowed = count <= limit;
    return {
      allowed,
      current: count,
      limit,
      retryAfterSeconds: allowed ? 0 : retryAfter(ttl, windowSeconds),
    };
  } catch (err) {
    rateLimitLog.error("admin api key rate limit unavailable — failing open", {
      key_id: keyId,
      kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, current: 0, limit, retryAfterSeconds: 0 };
  }
}

/**
 * Whether this IP may try another API key. Checked before verification, so a
 * blocked IP costs no database read. Only failures are counted (see
 * recordInvalidAdminApiKeyAttempt), so a busy but valid key is never slowed.
 * Fails open on Redis errors.
 */
export async function checkInvalidAdminApiKeyRateLimit(
  clientIp: string,
): Promise<LoginRateLimitResult> {
  const windowSeconds = Math.ceil(ADMIN_API_KEY_INVALID_WINDOW_MS / 1000);
  try {
    const { count, ttl } = readCountAndTtl(
      await redis.eval(PEEK_WITH_TTL_LUA, 1, adminApiKeyInvalidBucket(clientIp)),
    );
    const allowed = count < ADMIN_API_KEY_INVALID_LIMIT;
    return {
      allowed,
      current: count,
      limit: ADMIN_API_KEY_INVALID_LIMIT,
      retryAfterSeconds: allowed ? 0 : retryAfter(ttl, windowSeconds),
    };
  } catch (err) {
    rateLimitLog.error("admin api key invalid-attempt limit unavailable — failing open", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      allowed: true,
      current: 0,
      limit: ADMIN_API_KEY_INVALID_LIMIT,
      retryAfterSeconds: 0,
    };
  }
}

/** Counts one failed API key authentication for this IP. Never throws. */
export async function recordInvalidAdminApiKeyAttempt(clientIp: string): Promise<void> {
  const windowSeconds = Math.ceil(ADMIN_API_KEY_INVALID_WINDOW_MS / 1000);
  try {
    await redis.eval(
      RATE_LIMIT_WITH_TTL_LUA,
      1,
      adminApiKeyInvalidBucket(clientIp),
      String(windowSeconds),
    );
  } catch (err) {
    rateLimitLog.error("failed to record invalid admin api key attempt", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Public voucher limiters
// ---------------------------------------------------------------------------
/**
 * Voucher codes are bearer secrets, so the public lookup and redeem endpoints
 * are limited per client IP to keep guessing pointless (31^10 codes). Lookups
 * get a looser budget than redemptions because the redemption page checks the
 * code as it is typed.
 *
 * Fails closed like the gameplay limiters: a Redis error propagates and the
 * request answers 500 rather than letting unthrottled guesses through.
 */
export const VOUCHER_LOOKUP_LIMIT = 30;
export const VOUCHER_LOOKUP_WINDOW_MS = 60 * 1000;
export const VOUCHER_REDEEM_LIMIT = 10;
export const VOUCHER_REDEEM_WINDOW_MS = 15 * 60 * 1000;

async function checkIpRateLimit(
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<LoginRateLimitResult> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const { count, ttl } = readCountAndTtl(
    await redis.eval(RATE_LIMIT_WITH_TTL_LUA, 1, bucket, String(windowSeconds)),
  );
  const allowed = count <= limit;
  return {
    allowed,
    current: count,
    limit,
    retryAfterSeconds: allowed ? 0 : retryAfter(ttl, windowSeconds),
  };
}

export function checkVoucherLookupRateLimit(clientIp: string): Promise<LoginRateLimitResult> {
  return checkIpRateLimit(
    `ratelimit:voucher-lookup:${clientIp}`,
    VOUCHER_LOOKUP_LIMIT,
    VOUCHER_LOOKUP_WINDOW_MS,
  );
}

export function checkVoucherRedeemRateLimit(clientIp: string): Promise<LoginRateLimitResult> {
  return checkIpRateLimit(
    `ratelimit:voucher-redeem:${clientIp}`,
    VOUCHER_REDEEM_LIMIT,
    VOUCHER_REDEEM_WINDOW_MS,
  );
}

// ---------------------------------------------------------------------------
// Public route facts limiter
// ---------------------------------------------------------------------------
/**
 * `GET /public/route-families/:id/facts` is read by the marketing site's
 * build and its hourly revalidation, which fetch once per page, so the budget
 * is generous. It is there to keep a scraper from using the endpoint as a
 * free database load, and fails closed like the voucher limiters.
 */
export const PUBLIC_ROUTE_FACTS_LIMIT = 120;
export const PUBLIC_ROUTE_FACTS_WINDOW_MS = 60 * 1000;

export function checkPublicRouteFactsRateLimit(clientIp: string): Promise<LoginRateLimitResult> {
  return checkIpRateLimit(
    `ratelimit:public-route-facts:${clientIp}`,
    PUBLIC_ROUTE_FACTS_LIMIT,
    PUBLIC_ROUTE_FACTS_WINDOW_MS,
  );
}
