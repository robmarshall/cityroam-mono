import crypto from "node:crypto";

import type { WebSocket } from "ws";

import { chatMessageSchema } from "@cityroam/shared/validation";
import { TYPING_INDICATOR_DEBOUNCE_MS } from "@cityroam/shared/constants";
import type {
  WebSocketMessage,
  IncomingMessagePayload,
  TypingPayload,
  ErrorPayload,
} from "@cityroam/shared/types";

import { publishIncoming, publishTyping } from "../redis/pubsub.js";
import { redis } from "../redis/client.js";
import { updatePresence } from "./presence.js";

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
    sendError(ws, "Invalid JSON");
    return;
  }

  const { event_id, event_code, participant_id, display_name } = session;

  switch (message.type) {
    case "user_message": {
      const payload = message.payload as { text?: string };
      const result = chatMessageSchema.safeParse(payload?.text);
      if (!result.success) {
        sendError(ws, result.error.issues[0].message, "VALIDATION_ERROR");
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

    case "ping": {
      sendMessage(ws, { type: "pong", payload: {} });
      await updatePresence(event_code, participant_id);
      break;
    }

    default: {
      sendError(ws, "Unknown message type");
    }
  }
}
