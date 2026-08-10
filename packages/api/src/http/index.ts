import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { env, validateEnv } from "../env.js";
import { db, disconnectDb } from "../db/index.js";
import { redis, disconnectRedis } from "../redis/index.js";
import {
  createCorsMiddleware,
  requestLogger,
  errorHandler,
} from "../middleware/index.js";
import { eventRoutes } from "../routes/events.js";
import { checkoutRoutes } from "../routes/checkout.js";
import { adminRoutes } from "../routes/admin.js";
import { startExpirySweep, stopExpirySweep } from "../services/event-expiry.js";
import {
  startGroupReconciler,
  stopGroupReconciler,
} from "../services/group-reconciler.js";
import {
  startIncomingSubscriber,
  stopIncomingSubscriber,
} from "../services/pipeline/incoming-subscriber.js";
import {
  startIdleTimer,
  stopIdleTimer,
} from "../services/pipeline/idle-timer.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("http");

validateEnv("http");

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

// Event routes
app.route("/", eventRoutes);

// Checkout & webhook routes
app.route("/", checkoutRoutes);

// Admin routes
app.route("/", adminRoutes);

// Start server
const port = Number(env.PORT);

const server = serve({ fetch: app.fetch, port }, () => {
  log.info("server listening", { port });
  startExpirySweep();
  startIdleTimer();
  startIncomingSubscriber().catch((err) =>
    log.error("failed to start incoming subscriber", { error: err instanceof Error ? err.message : String(err) }),
  );
  startGroupReconciler();
});

// Graceful shutdown
async function shutdown() {
  log.info("shutting down");
  stopExpirySweep();
  stopIdleTimer();
  stopGroupReconciler();
  await stopIncomingSubscriber();
  server.close();
  await Promise.all([disconnectRedis(), disconnectDb()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
