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
  LeadChangedPayload,
  BlockAdvancedPayload,
  MessageDroppedPayload,
  ActionWaitingPayload,
  LanguageChangedPayload,
  SupportedLanguage,
} from "@cityroam/shared/types";
import { WebSocket as WS } from "ws";

type GetConnectionsFn = (eventCode: string) => Map<string, WS> | undefined;

/**
 * Redis subscription bookkeeping.
 *
 * Subscribe and unsubscribe both await a Redis round trip, so they must not be
 * allowed to interleave: a reconnect landing while an unsubscribe was in
 * flight used to resubscribe, then have the pending unsubscribe tear the
 * channels down again while the event still counted as subscribed — no
 * broadcast reached that hunt again for its lifetime. Every operation for an
 * event code is therefore appended to a per-code promise chain, and the
 * subscription is only dropped when the last connection has gone.
 */
const subscribedEvents = new Set<string>();
const refCounts = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

function enqueue(eventCode: string, op: () => Promise<void>): Promise<void> {
  const prev = chains.get(eventCode) ?? Promise.resolve();
  const run = prev.then(op);

  const settled: Promise<void> = run.then(
    () => undefined,
    () => undefined,
  ).then(() => {
    // Drop the chain once the event is idle so the map doesn't grow forever
    if (chains.get(eventCode) === settled && !refCounts.has(eventCode)) {
      chains.delete(eventCode);
    }
  });

  chains.set(eventCode, settled);
  return run;
}

/** Test seam: current connection refcount for an event. */
export function subscriptionRefCount(eventCode: string): number {
  return refCounts.get(eventCode) ?? 0;
}

/** Test seam: whether the event's Redis channels are currently subscribed. */
export function isEventSubscribed(eventCode: string): boolean {
  return subscribedEvents.has(eventCode);
}

/** Test seam: wipe bookkeeping between tests. */
export function resetSubscriptionState(): void {
  subscribedEvents.clear();
  refCounts.clear();
  chains.clear();
}

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
  return enqueue(eventCode, async () => {
    refCounts.set(eventCode, (refCounts.get(eventCode) ?? 0) + 1);
    if (subscribedEvents.has(eventCode)) return;

    await subscribeToRedis(eventCode, getConnections);
    subscribedEvents.add(eventCode);
  });
}

async function subscribeToRedis(
  eventCode: string,
  getConnections: GetConnectionsFn,
): Promise<void> {
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
              participant_id: payload.data.participant_id,
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
              participant_id: payload.data.participant_id,
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
        case "block_advanced": {
          const message: WebSocketMessage<BlockAdvancedPayload> = {
            type: "block_advanced",
            payload: { block_id: payload.data.block_id },
          };
          broadcast(connections, message);
          break;
        }
        case "lead_changed": {
          const message: WebSocketMessage<LeadChangedPayload> = {
            type: "lead_changed",
            payload: {
              participant_id: payload.data.participant_id,
              name: payload.data.name,
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
        case "language_changed": {
          const message: WebSocketMessage<LanguageChangedPayload> = {
            type: "language_changed",
            payload: { language: payload.data.language as SupportedLanguage },
          };
          broadcast(connections, message);
          break;
        }
      }
    },
  });
}

export async function unsubscribeEvent(eventCode: string): Promise<void> {
  return enqueue(eventCode, async () => {
    const remaining = Math.max(0, (refCounts.get(eventCode) ?? 0) - 1);

    if (remaining > 0) {
      refCounts.set(eventCode, remaining);
      return;
    }

    refCounts.delete(eventCode);

    if (!subscribedEvents.has(eventCode)) return;

    await unsubscribeFromEvent(eventCode);

    // Nothing can have reconnected during the await — a subscribeEvent call is
    // queued behind this one and will resubscribe after we clear the flag.
    if ((refCounts.get(eventCode) ?? 0) === 0) {
      subscribedEvents.delete(eventCode);
    }
  });
}

export async function unsubscribeAll(): Promise<void> {
  const codes = [...subscribedEvents];
  await Promise.all(
    codes.map((code) =>
      enqueue(code, async () => {
        refCounts.delete(code);
        if (!subscribedEvents.has(code)) return;
        await unsubscribeFromEvent(code);
        subscribedEvents.delete(code);
      }),
    ),
  );
  subscribedEvents.clear();
  refCounts.clear();
  chains.clear();
}
