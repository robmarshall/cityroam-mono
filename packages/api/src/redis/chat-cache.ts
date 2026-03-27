import type { ChatMessagePayload } from "@cityroam/shared/types";
import { redis } from "./client.js";

const CHAT_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function chatKey(code: string): string {
  return `chat:${code}:messages`;
}

export async function appendMessage(
  code: string,
  message: ChatMessagePayload,
): Promise<void> {
  const key = chatKey(code);
  await redis.rpush(key, JSON.stringify(message));
  await redis.expire(key, CHAT_CACHE_TTL_SECONDS);
}

export async function getMessages(
  code: string,
): Promise<ChatMessagePayload[]> {
  const raw = await redis.lrange(chatKey(code), 0, -1);
  return raw.flatMap((entry) => {
    try {
      return [JSON.parse(entry) as ChatMessagePayload];
    } catch {
      return [];
    }
  });
}

export async function getMessagesSince(
  code: string,
  since: string,
): Promise<ChatMessagePayload[]> {
  const messages = await getMessages(code);
  const sinceTime = new Date(since).getTime();
  return messages.filter(
    (msg) => new Date(msg.created_at).getTime() > sinceTime,
  );
}
