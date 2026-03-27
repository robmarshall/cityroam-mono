import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "../env.js";
import { redis, disconnectRedis } from "../redis.js";
import { requestLogger, errorHandler } from "../middleware/index.js";

const app = new Hono();

// Global middleware
app.use("*", requestLogger);
app.onError(errorHandler);

// Health check
app.get("/health", async (c) => {
  const checks = { redis: "ok" as string, active_connections: 0 };

  try {
    await redis.ping();
  } catch {
    checks.redis = "error";
  }

  const healthy = checks.redis === "ok";
  return c.json(
    { status: healthy ? "ok" : "degraded", ...checks },
    healthy ? 200 : 503,
  );
});

// Start server
const port = Number(env.WS_PORT);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[ws] server listening on port ${port}`);
});

// Graceful shutdown
async function shutdown() {
  console.log("[ws] shutting down...");
  server.close();
  await disconnectRedis();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
