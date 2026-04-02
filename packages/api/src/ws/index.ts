import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { WEBSOCKET_PING_INTERVAL_MS } from "@cityroam/shared/constants";
import { env, validateEnv } from "../env.js";
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
import { createLogger } from "../lib/logger.js";

const log = createLogger("ws");

// Augment the ws.WebSocket type to track liveness for server-side ping
declare module "ws" {
  interface WebSocket {
    isAlive: boolean;
    missedPongs: number;
  }
}

validateEnv("ws");

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

        // Register connection (may replace an existing one for the same participant)
        const { isFirstForEvent, previousWs } = addConnection(session.event_code, session.participant_id, raw);

        // Close the stale socket if the participant already had one
        if (previousWs) {
          log.info("replacing stale connection", { eventCode: session.event_code, participantId: session.participant_id });
          previousWs.close(1000, "Replaced by new connection");
        }

        // Track pong responses for liveness detection
        raw.isAlive = true;
        raw.missedPongs = 0;
        raw.on("pong", () => { raw.isAlive = true; raw.missedPongs = 0; });

        log.info("connection opened", { eventCode: session.event_code, participantId: session.participant_id });

        // Update presence
        await updatePresence(session.event_code, session.participant_id);

        // Subscribe to Redis channels if first connection for this event
        if (isFirstForEvent) {
          await subscribeEvent(session.event_code, getConnections);
        }
      },

      async onMessage(evt, ws) {
        const raw = ws.raw as import("ws").WebSocket;
        const data = typeof evt.data === "string" ? evt.data : evt.data.toString();
        try {
          await handleClientMessage(raw, data, session);
        } catch (err) {
          log.error("message handler error", { eventCode: session.event_code, participantId: session.participant_id, error: err instanceof Error ? err.message : String(err) });
        }
      },

      async onClose(evt, ws) {
        const raw = ws.raw as import("ws").WebSocket;
        const code = typeof evt === "object" && evt !== null && "code" in evt ? (evt as { code: number }).code : undefined;
        const reason = typeof evt === "object" && evt !== null && "reason" in evt ? (evt as { reason: string }).reason : undefined;
        log.info("connection closed", { eventCode: session.event_code, participantId: session.participant_id, code, reason });

        // Only remove if this socket is still the registered one (not replaced by a reconnection)
        const wasLast = removeConnection(session.event_code, session.participant_id, raw);

        // Unsubscribe from Redis channels if no more connections for this event
        if (wasLast) {
          await unsubscribeEvent(session.event_code);
        }
      },

      onError(err) {
        log.error("websocket error", { eventCode: session.event_code, participantId: session.participant_id, error: err instanceof Error ? err.message : String(err) });
      },
    };
  }),
);

// Start server
const port = Number(env.WS_PORT);

const server = serve({ fetch: app.fetch, port }, () => {
  log.info("server listening", { port });
  startPresenceSweep(hasConnection, getAllEventCodes);
});

injectWebSocket(server);

// ---------------------------------------------------------------------------
// Server-side WebSocket ping — keeps connections alive through proxies and
// detects dead clients that didn't cleanly disconnect.
// ---------------------------------------------------------------------------

const MAX_MISSED_PONGS = 2;

const pingInterval = setInterval(() => {
  for (const eventCode of getAllEventCodes()) {
    const eventConnections = getConnections(eventCode);
    if (!eventConnections) continue;

    for (const [participantId, ws] of eventConnections) {
      if (!ws.isAlive) {
        ws.missedPongs = (ws.missedPongs ?? 0) + 1;
        if (ws.missedPongs >= MAX_MISSED_PONGS) {
          log.warn("terminating unresponsive connection", { eventCode, participantId, missedPongs: ws.missedPongs });
          ws.terminate();
          continue;
        }
      } else {
        ws.missedPongs = 0;
      }

      // Mark as not-alive; the pong handler in onOpen will reset this to true
      ws.isAlive = false;
      ws.ping();
    }
  }
}, WEBSOCKET_PING_INTERVAL_MS);

// Graceful shutdown
async function shutdown() {
  log.info("shutting down");
  clearInterval(pingInterval);
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
