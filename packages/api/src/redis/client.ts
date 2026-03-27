import Redis from "ioredis";
import { env } from "../env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const redisSub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("[redis:cmd] connection error:", err.message);
});

redisSub.on("error", (err) => {
  console.error("[redis:sub] connection error:", err.message);
});

export async function disconnectRedis(): Promise<void> {
  await Promise.all([redis.quit(), redisSub.quit()]);
}
