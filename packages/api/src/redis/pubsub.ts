import type {
  BroadcastMessagePayload,
  ControlEventPayload,
  IncomingMessagePayload,
  TypingPayload,
} from "@cityroam/shared/types";
import { redis, redisSub } from "./client.js";

// Channel naming helpers
export function incomingChannel(code: string): string {
  return `event:${code}:incoming`;
}

export function messagesChannel(code: string): string {
  return `event:${code}:messages`;
}

export function typingChannel(code: string): string {
  return `event:${code}:typing`;
}

export function controlChannel(code: string): string {
  return `event:${code}:control`;
}

// Extract event code from a channel name like "event:ABCD1234:incoming"
export function extractEventCode(channel: string): string | null {
  const match = channel.match(/^event:([^:]+):/);
  return match ? match[1] : null;
}

// Publish helpers
export async function publishIncoming(
  code: string,
  payload: IncomingMessagePayload,
): Promise<void> {
  await redis.publish(incomingChannel(code), JSON.stringify(payload));
}

export async function publishMessage(
  code: string,
  payload: BroadcastMessagePayload,
): Promise<void> {
  await redis.publish(messagesChannel(code), JSON.stringify(payload));
}

export async function publishTyping(
  code: string,
  payload: TypingPayload,
): Promise<void> {
  await redis.publish(typingChannel(code), JSON.stringify(payload));
}

export async function publishControl(
  code: string,
  payload: ControlEventPayload,
): Promise<void> {
  await redis.publish(controlChannel(code), JSON.stringify(payload));
}

// Subscribe helpers
export type MessageHandler<T> = (code: string, payload: T) => void;

/**
 * Per-event handler sets, plus one process-wide "message" listener that fans
 * out to them.
 *
 * A listener per event code both leaked (a resubscribe overwrote the map entry
 * and left the old listener attached to redisSub) and would trip ioredis's
 * default max-listeners warning once a dozen hunts ran at the same time.
 */
type EventHandlers = {
  onMessage?: MessageHandler<BroadcastMessagePayload>;
  onTyping?: MessageHandler<TypingPayload>;
  onControl?: MessageHandler<ControlEventPayload>;
};

const eventHandlers = new Map<string, Set<EventHandlers>>();

let fanoutAttached = false;

function dispatch(channel: string, message: string): void {
  const code = extractEventCode(channel);
  if (!code) return;

  const handlers = eventHandlers.get(code);
  if (!handlers || handlers.size === 0) return;

  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    // Skip corrupted messages
    return;
  }

  for (const handler of handlers) {
    try {
      if (channel.endsWith(":messages")) {
        handler.onMessage?.(code, payload as BroadcastMessagePayload);
      } else if (channel.endsWith(":typing")) {
        handler.onTyping?.(code, payload as TypingPayload);
      } else if (channel.endsWith(":control")) {
        handler.onControl?.(code, payload as ControlEventPayload);
      }
    } catch {
      // One throwing handler must not starve the rest
    }
  }
}

function ensureFanout(): void {
  if (fanoutAttached) return;
  fanoutAttached = true;
  redisSub.on("message", dispatch);
}

/** Test seam: how many handler sets are currently registered. */
export function eventHandlerCount(code: string): number {
  return eventHandlers.get(code)?.size ?? 0;
}

export async function subscribeToIncomingPattern(
  handler: MessageHandler<IncomingMessagePayload>,
): Promise<() => Promise<void>> {
  await redisSub.psubscribe("event:*:incoming");

  const pmessageHandler = (_pattern: string, channel: string, message: string) => {
    const code = extractEventCode(channel);
    if (!code) return;
    try {
      const payload = JSON.parse(message) as IncomingMessagePayload;
      handler(code, payload);
    } catch {
      // Skip corrupted messages
    }
  };
  redisSub.on("pmessage", pmessageHandler);

  return async () => {
    redisSub.off("pmessage", pmessageHandler);
    await redisSub.punsubscribe("event:*:incoming");
  };
}

export async function subscribeToEvent(
  code: string,
  handlers: EventHandlers,
): Promise<void> {
  const channels: string[] = [];
  if (handlers.onMessage) channels.push(messagesChannel(code));
  if (handlers.onTyping) channels.push(typingChannel(code));
  if (handlers.onControl) channels.push(controlChannel(code));

  if (channels.length === 0) return;

  ensureFanout();

  // Register before awaiting so a message that lands during the subscribe
  // round trip still finds a handler.
  let set = eventHandlers.get(code);
  if (!set) {
    set = new Set<EventHandlers>();
    eventHandlers.set(code, set);
  }
  set.add(handlers);

  try {
    await redisSub.subscribe(...channels);
  } catch (err) {
    set.delete(handlers);
    if (set.size === 0) eventHandlers.delete(code);
    throw err;
  }
}

export async function unsubscribeFromEvent(code: string): Promise<void> {
  eventHandlers.delete(code);

  await redisSub.unsubscribe(
    messagesChannel(code),
    typingChannel(code),
    controlChannel(code),
  );
}
