import Redis from "ioredis";
import { env } from "../env.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("redis");

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const redisSub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  log.error("command client error", { error: err.message });
});

redisSub.on("error", (err) => {
  log.error("subscription client error", { error: err.message });
});

export async function disconnectRedis(): Promise<void> {
  await Promise.all([redis.quit(), redisSub.quit()]);
}
