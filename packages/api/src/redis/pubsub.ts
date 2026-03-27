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

// Track per-event message listeners so they can be removed on unsubscribe
const eventMessageHandlers = new Map<
  string,
  (channel: string, message: string) => void
>();

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
  handlers: {
    onMessage?: MessageHandler<BroadcastMessagePayload>;
    onTyping?: MessageHandler<TypingPayload>;
    onControl?: MessageHandler<ControlEventPayload>;
  },
): Promise<void> {
  const channels: string[] = [];
  if (handlers.onMessage) channels.push(messagesChannel(code));
  if (handlers.onTyping) channels.push(typingChannel(code));
  if (handlers.onControl) channels.push(controlChannel(code));

  if (channels.length === 0) return;
  await redisSub.subscribe(...channels);

  const messageHandler = (channel: string, message: string) => {
    const msgCode = extractEventCode(channel);
    if (msgCode !== code) return;

    try {
      if (channel.endsWith(":messages") && handlers.onMessage) {
        handlers.onMessage(code, JSON.parse(message) as BroadcastMessagePayload);
      } else if (channel.endsWith(":typing") && handlers.onTyping) {
        handlers.onTyping(code, JSON.parse(message) as TypingPayload);
      } else if (channel.endsWith(":control") && handlers.onControl) {
        handlers.onControl(code, JSON.parse(message) as ControlEventPayload);
      }
    } catch {
      // Skip corrupted messages
    }
  };

  eventMessageHandlers.set(code, messageHandler);
  redisSub.on("message", messageHandler);
}

export async function unsubscribeFromEvent(code: string): Promise<void> {
  const handler = eventMessageHandlers.get(code);
  if (handler) {
    redisSub.off("message", handler);
    eventMessageHandlers.delete(code);
  }

  await redisSub.unsubscribe(
    messagesChannel(code),
    typingChannel(code),
    controlChannel(code),
  );
}
