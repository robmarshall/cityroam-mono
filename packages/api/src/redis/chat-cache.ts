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

/**
 * Remove a single message from the cached list by its ID.
 * Scans the list, finds the entry matching the ID, and removes it.
 */
export async function removeMessage(
  code: string,
  messageId: string,
): Promise<void> {
  const key = chatKey(code);
  const raw = await redis.lrange(key, 0, -1);
  for (const entry of raw) {
    try {
      const parsed = JSON.parse(entry) as ChatMessagePayload;
      if (parsed.id === messageId) {
        await redis.lrem(key, 1, entry);
        return;
      }
    } catch {
      // Skip corrupt entries
    }
  }
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
