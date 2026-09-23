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
