import {
  GUIDE_RATE_LIMIT_MS,
  PARTICIPANT_RATE_LIMIT_COUNT,
  PARTICIPANT_RATE_LIMIT_WINDOW_MS,
} from "@cityroam/shared/constants";
import { redis } from "./client.js";

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
