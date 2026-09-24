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
import { adminApiKeyRoutes } from "../routes/admin-api-keys.js";
import { voucherRoutes } from "../routes/vouchers.js";
import { adminVoucherRoutes } from "../routes/admin-vouchers.js";
import { routeFactsRoutes } from "../routes/route-facts.js";
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
import {
  startRetentionSweep,
  stopRetentionSweep,
} from "../services/data-retention.js";
import { createLogger } from "../lib/logger.js";
import { initSentry, flushSentry } from "../lib/sentry.js";

const log = createLogger("http");

validateEnv("http");
initSentry("http");

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

// Admin API key management + audit log (session-only)
app.route("/", adminApiKeyRoutes);

// Gift vouchers: public lookup/redeem and session-only admin
app.route("/", voucherRoutes);
app.route("/", adminVoucherRoutes);

// Route facts: admin GET/PUT and the public read for the marketing site
app.route("/", routeFactsRoutes);

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
  startRetentionSweep();
});

// Graceful shutdown
async function shutdown() {
  log.info("shutting down");
  stopExpirySweep();
  stopIdleTimer();
  stopGroupReconciler();
  stopRetentionSweep();
  await stopIncomingSubscriber();
  server.close();
  await Promise.all([disconnectRedis(), disconnectDb(), flushSentry()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
