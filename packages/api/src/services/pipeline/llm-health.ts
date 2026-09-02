/**
 * Circuit breaker for the LLM provider.
 *
 * DeepSeek's client timeout is 30s. Without a breaker, every player message
 * during a provider outage waits the full 30s before the pipeline can fall
 * back — with a whole group typing that queues up minutes of dead air on top
 * of an already-degraded hunt. The breaker turns the second and subsequent
 * failures into an instant null so the deterministic fallbacks run at once.
 *
 * State lives in Redis so every API process shares one view of the provider.
 * Redis errors are swallowed: a broken breaker must never be worse than no
 * breaker, so on any Redis failure we report "healthy" and let the call
 * through.
 */

import { redis } from "../../redis/client.js";
import { createLogger } from "../../lib/logger.js";
import type { LLMService } from "../llm/interface.js";

const log = createLogger("llm-health");

/** Set while the breaker is open. Presence is the whole signal. */
const UNHEALTHY_KEY = "llm:unhealthy";
/** Rolling failure counter that trips the breaker. */
const FAILURE_KEY = "llm:failures";

/** Failures inside FAILURE_WINDOW_SECONDS before the breaker opens. */
export const LLM_FAILURE_THRESHOLD = 3;
/** How long failures accumulate. Isolated blips age out instead of tripping. */
const FAILURE_WINDOW_SECONDS = 60;
/**
 * How long the breaker stays open. When it expires the next message probes
 * the provider for real; if that probe fails the counter (still inside its
 * longer window) re-trips the breaker immediately.
 */
const UNHEALTHY_TTL_SECONDS = 30;

/**
 * INCR the failure counter, giving it an expiry on first use, and open the
 * breaker once the counter reaches the threshold. One round trip.
 */
const RECORD_FAILURE_LUA = `
local failKey = KEYS[1]
local flagKey = KEYS[2]
local threshold = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local count = redis.call("INCR", failKey)
if count == 1 then
  redis.call("EXPIRE", failKey, window)
end
if count >= threshold then
  redis.call("SETEX", flagKey, ttl, "1")
end
return count
`;

/** Whether the breaker is open, i.e. the provider is believed to be down. */
export async function isLLMUnhealthy(): Promise<boolean> {
  try {
    return (await redis.get(UNHEALTHY_KEY)) !== null;
  } catch (error) {
    log.warn("breaker read failed, assuming healthy", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Record a failed LLM call, opening the breaker once the threshold is hit. */
export async function recordLLMFailure(): Promise<void> {
  try {
    const count = (await redis.eval(
      RECORD_FAILURE_LUA,
      2,
      FAILURE_KEY,
      UNHEALTHY_KEY,
      String(LLM_FAILURE_THRESHOLD),
      String(FAILURE_WINDOW_SECONDS),
      String(UNHEALTHY_TTL_SECONDS),
    )) as number;
    if (count >= LLM_FAILURE_THRESHOLD) {
      log.error("breaker open", { failures: count, ttl_s: UNHEALTHY_TTL_SECONDS });
    }
  } catch (error) {
    log.warn("breaker write failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Record a successful LLM call, closing the breaker and clearing the count. */
export async function recordLLMSuccess(): Promise<void> {
  try {
    await redis.del(FAILURE_KEY, UNHEALTHY_KEY);
  } catch (error) {
    log.warn("breaker clear failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Wrap an LLM service so every call through it feeds the breaker, and so
 * calls made while the breaker is open return null immediately instead of
 * waiting out the provider timeout.
 *
 * Callers already treat null as "LLM unavailable" and fall back to scripted
 * text, so wrapping needs no changes at the call sites — it only makes the
 * fallback fast.
 */
export function withHealthTracking(inner: LLMService): LLMService {
  return {
    async classify(prompt: string): Promise<object | null> {
      if (await isLLMUnhealthy()) {
        log.warn("breaker open, skipping call");
        return null;
      }

      const result = await inner.classify(prompt);

      if (result === null) {
        await recordLLMFailure();
      } else {
        await recordLLMSuccess();
      }

      return result;
    },
  };
}
