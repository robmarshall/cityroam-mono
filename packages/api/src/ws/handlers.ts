import crypto from "node:crypto";

import type { WebSocket } from "ws";

import { chatMessageSchema } from "@cityroam/shared/validation";
import { TYPING_INDICATOR_DEBOUNCE_MS } from "@cityroam/shared/constants";
import type {
  WebSocketMessage,
  IncomingMessagePayload,
  TypingPayload,
  ErrorPayload,
  ActionConfirmPayload,
} from "@cityroam/shared/types";

import { eq } from "drizzle-orm";
import { publishIncoming, publishTyping } from "../redis/pubsub.js";
import { redis } from "../redis/client.js";
import { db, schema } from "../db/index.js";
import { advanceAfterBlock } from "../services/group-runner.js";
import { createLogger } from "../lib/logger.js";
import { updatePresence } from "./presence.js";

const log = createLogger("ws-handlers");

export interface SessionInfo {
  participant_id: string;
  event_id: string;
  event_code: string;
  display_name: string;
  is_lead: boolean;
}

const TYPING_TTL_SECONDS = TYPING_INDICATOR_DEBOUNCE_MS / 1000;

export function sendMessage(ws: WebSocket, message: WebSocketMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, message: string, code?: string): void {
  const payload: ErrorPayload = { message, ...(code ? { code } : {}) };
  sendMessage(ws, { type: "error", payload });
}

export async function handleClientMessage(
  ws: WebSocket,
  data: string,
  session: SessionInfo,
): Promise<void> {
  let message: WebSocketMessage;
  try {
    message = JSON.parse(data) as WebSocketMessage;
  } catch {
    sendError(ws, "Invalid JSON message", "INVALID_JSON");
    return;
  }

  const { event_id, event_code, participant_id, display_name } = session;

  switch (message.type) {
    case "user_message": {
      const payload = message.payload as { text?: string };
      const result = chatMessageSchema.safeParse(payload?.text);
      if (!result.success) {
        sendError(ws, "Invalid message", result.error.issues[0].message);
        return;
      }

      const incoming: IncomingMessagePayload = {
        event_id,
        event_code,
        participant_id,
        participant_name: display_name,
        text: result.data,
        message_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      await publishIncoming(event_code, incoming);
      break;
    }

    case "typing_start": {
      const typingKey = `typing:${event_code}:${participant_id}`;
      await redis.set(typingKey, "1", "EX", TYPING_TTL_SECONDS);

      const typingPayload: TypingPayload = {
        type: "participant_typing",
        participant_name: display_name,
        participant_id,
        is_typing: true,
      };
      await publishTyping(event_code, typingPayload);
      break;
    }

    case "typing_stop": {
      const typingKey = `typing:${event_code}:${participant_id}`;
      await redis.del(typingKey);

      const typingPayload: TypingPayload = {
        type: "participant_typing",
        participant_name: display_name,
        participant_id,
        is_typing: false,
      };
      await publishTyping(event_code, typingPayload);
      break;
    }

    case "action_confirm": {
      const confirmPayload = message.payload as ActionConfirmPayload;
      if (!confirmPayload?.block_id) {
        sendError(ws, "Missing block_id in action confirmation", "ACTION_MISSING_BLOCK");
        return;
      }

      if (!session.is_lead) {
        sendError(ws, "Only the lead can confirm actions", "ACTION_LEAD_ONLY");
        return;
      }

      // Verify block_id matches the event's current_block_id
      const event = await db.query.events.findFirst({
        where: eq(schema.events.id, event_id),
        columns: { current_block_id: true },
      });

      if (!event || event.current_block_id !== confirmPayload.block_id) {
        sendError(ws, "Block does not match current state", "ACTION_BLOCK_MISMATCH");
        return;
      }

      log.info("action confirmed by lead", { eventCode: event_code, blockId: confirmPayload.block_id });
      advanceAfterBlock(event_id, event_code, confirmPayload.block_id).catch((err) => {
        log.error("advanceAfterBlock failed", { error: err });
      });
      break;
    }

    case "ping": {
      sendMessage(ws, { type: "pong", payload: {} });
      await updatePresence(event_code, participant_id);
      break;
    }

    default: {
      sendError(ws, "Unknown message type", "UNKNOWN_MESSAGE_TYPE");
    }
  }
}
