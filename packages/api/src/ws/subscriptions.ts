import { subscribeToEvent, unsubscribeFromEvent } from "../redis/pubsub.js";
import type {
  BroadcastMessagePayload,
  TypingPayload,
  ControlEventPayload,
  WebSocketMessage,
  ChatMessagePayload,
  GuideTypingPayload,
  ParticipantTypingPayload,
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  GameStartedPayload,
  GameCompletePayload,
  NameChangedPayload,
  MessageDroppedPayload,
  ActionWaitingPayload,
} from "@cityroam/shared/types";
import { WebSocket as WS } from "ws";

type GetConnectionsFn = (eventCode: string) => Map<string, WS> | undefined;

const subscribedEvents = new Set<string>();

function broadcast(
  connections: Map<string, WS>,
  message: WebSocketMessage,
  excludeParticipantId?: string,
): void {
  const data = JSON.stringify(message);
  for (const [participantId, ws] of connections) {
    if (excludeParticipantId && participantId === excludeParticipantId)
      continue;
    if (ws.readyState === WS.OPEN) {
      ws.send(data);
    }
  }
}

export async function subscribeEvent(
  eventCode: string,
  getConnections: GetConnectionsFn,
): Promise<void> {
  if (subscribedEvents.has(eventCode)) return;
  subscribedEvents.add(eventCode);

  await subscribeToEvent(eventCode, {
    onMessage(_code: string, payload: BroadcastMessagePayload) {
      const connections = getConnections(eventCode);
      if (!connections) return;

      const message: WebSocketMessage<ChatMessagePayload> = {
        type: "chat_message",
        payload,
      };
      broadcast(connections, message);
    },

    onTyping(_code: string, payload: TypingPayload) {
      const connections = getConnections(eventCode);
      if (!connections) return;

      if (payload.type === "guide_typing") {
        const message: WebSocketMessage<GuideTypingPayload> = {
          type: "guide_typing",
          payload: { is_typing: payload.is_typing },
        };
        broadcast(connections, message);
      } else if (payload.type === "participant_typing") {
        const message: WebSocketMessage<ParticipantTypingPayload> = {
          type: "participant_typing",
          payload: {
            name: payload.participant_name!,
            is_typing: payload.is_typing,
          },
        };
        broadcast(connections, message, payload.participant_id ?? undefined);
      }
    },

    onControl(_code: string, payload: ControlEventPayload) {
      const connections = getConnections(eventCode);
      if (!connections) return;

      switch (payload.type) {
        case "game_started": {
          const message: WebSocketMessage<GameStartedPayload> = {
            type: "game_started",
            payload: { started_by: payload.data.started_by },
          };
          broadcast(connections, message);
          break;
        }
        case "game_complete": {
          const message: WebSocketMessage<GameCompletePayload> = {
            type: "game_complete",
            payload: { summary: payload.data.summary },
          };
          broadcast(connections, message);
          break;
        }
        case "participant_joined": {
          const message: WebSocketMessage<ParticipantJoinedPayload> = {
            type: "participant_joined",
            payload: {
              name: payload.data.name,
              participant_count: payload.data.participant_count,
            },
          };
          broadcast(connections, message);
          break;
        }
        case "participant_left": {
          const message: WebSocketMessage<ParticipantLeftPayload> = {
            type: "participant_left",
            payload: {
              name: payload.data.name,
              participant_count: payload.data.participant_count,
              reason: payload.data.reason,
            },
          };
          broadcast(connections, message);
          break;
        }
        case "name_changed": {
          const message: WebSocketMessage<NameChangedPayload> = {
            type: "name_changed",
            payload: {
              participant_id: payload.data.participant_id,
              old_name: payload.data.old_name,
              new_name: payload.data.new_name,
            },
          };
          broadcast(connections, message);
          break;
        }
        case "message_dropped": {
          const message: WebSocketMessage<MessageDroppedPayload> = {
            type: "message_dropped",
            payload: { message_id: payload.data.message_id },
          };
          broadcast(connections, message);
          break;
        }
        case "action_waiting": {
          const message: WebSocketMessage<ActionWaitingPayload> = {
            type: "action_waiting",
            payload: {
              block_id: payload.data.block_id,
              label: payload.data.label,
            },
          };
          broadcast(connections, message);
          break;
        }
      }
    },
  });
}

export async function unsubscribeEvent(eventCode: string): Promise<void> {
  subscribedEvents.delete(eventCode);
  await unsubscribeFromEvent(eventCode);
}

export async function unsubscribeAll(): Promise<void> {
  const promises = [...subscribedEvents].map((code) =>
    unsubscribeFromEvent(code),
  );
  await Promise.all(promises);
  subscribedEvents.clear();
}
