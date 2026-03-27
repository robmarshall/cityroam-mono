import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { env } from "../env.js";
import { db, disconnectDb } from "../db/index.js";
import { redis, disconnectRedis } from "../redis/index.js";
import {
  createCorsMiddleware,
  requestLogger,
  errorHandler,
} from "../middleware/index.js";

const app = new Hono();

// Global middleware
app.use("*", createCorsMiddleware());
app.use("*", requestLogger);
app.onError(errorHandler);

// Health check
app.get("/health", async (c) => {
  const checks = { db: "ok" as string, redis: "ok" as string };

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    checks.db = "error";
  }

  try {
    await redis.ping();
  } catch {
    checks.redis = "error";
  }

  const healthy = checks.db === "ok" && checks.redis === "ok";
  return c.json(
    { status: healthy ? "ok" : "degraded", ...checks },
    healthy ? 200 : 503,
  );
});

// Start server
const port = Number(env.PORT);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[http] server listening on port ${port}`);
});

// Graceful shutdown
async function shutdown() {
  console.log("[http] shutting down...");
  server.close();
  await Promise.all([disconnectRedis(), disconnectDb()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
