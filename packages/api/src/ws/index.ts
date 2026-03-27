import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { env } from "../env.js";
import { redis, disconnectRedis } from "../redis/index.js";
import { disconnectDb } from "../db/index.js";
import { requestLogger, errorHandler } from "../middleware/index.js";
import { authenticateConnection } from "./auth.js";
import { handleClientMessage } from "./handlers.js";
import { updatePresence } from "./presence.js";
import { startPresenceSweep, stopPresenceSweep } from "./presence.js";
import {
  addConnection,
  removeConnection,
  getConnections,
  getConnectionCount,
  getAllEventCodes,
  hasConnection,
  closeAllConnections,
} from "./connections.js";
import { subscribeEvent, unsubscribeEvent, unsubscribeAll } from "./subscriptions.js";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Global middleware
app.use("*", requestLogger);
app.onError(errorHandler);

// Health check
app.get("/health", async (c) => {
  const checks = { redis: "ok" as string, active_connections: getConnectionCount() };

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

// WebSocket endpoint
app.get(
  "/ws/:code",
  upgradeWebSocket(async (c) => {
    const eventCode = c.req.param("code") ?? "";
    const token = new URL(c.req.url).searchParams.get("token");

    const authResult = await authenticateConnection(eventCode, token);

    if (!authResult.success) {
      return {
        onOpen(_evt, ws) {
          ws.close(authResult.closeCode, authResult.reason);
        },
      };
    }

    const session = authResult.session;

    return {
      async onOpen(_evt, ws) {
        const raw = ws.raw as import("ws").WebSocket;

        // Register connection
        const isFirst = addConnection(session.event_code, session.participant_id, raw);

        // Update presence
        await updatePresence(session.event_code, session.participant_id);

        // Subscribe to Redis channels if first connection for this event
        if (isFirst) {
          await subscribeEvent(session.event_code, getConnections);
        }
      },

      async onMessage(evt, ws) {
        const raw = ws.raw as import("ws").WebSocket;
        const data = typeof evt.data === "string" ? evt.data : evt.data.toString();
        try {
          await handleClientMessage(raw, data, session);
        } catch (err) {
          console.error(
            `[ws] message handler error for ${session.event_code}/${session.participant_id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      },

      async onClose() {
        // Remove connection from map
        const wasLast = removeConnection(session.event_code, session.participant_id);

        // Unsubscribe from Redis channels if no more connections for this event
        if (wasLast) {
          await unsubscribeEvent(session.event_code);
        }
      },

      onError(err) {
        console.error(
          `[ws] error for ${session.event_code}/${session.participant_id}:`,
          err instanceof Error ? err.message : err,
        );
      },
    };
  }),
);

// Start server
const port = Number(env.WS_PORT);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[ws] server listening on port ${port}`);
  startPresenceSweep(hasConnection, getAllEventCodes);
});

injectWebSocket(server);

// Graceful shutdown
async function shutdown() {
  console.log("[ws] shutting down...");
  stopPresenceSweep();
  closeAllConnections(1001, "Server shutting down");
  await unsubscribeAll();
  server.close();
  await Promise.all([disconnectRedis(), disconnectDb()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
