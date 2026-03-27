import {
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
} from "@cityroam/shared/constants";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { checkParticipantRateLimit } from "../../redis/rate-limit.js";

export interface PreFilterResult {
  action: "pass" | "drop" | "respond";
  response?: string;
}

/**
 * Layer 1: Programmatic pre-filter (no LLM).
 * Fast code-only checks before message enters the AI pipeline.
 */
export async function preFilter(
  text: string,
  eventCode: string,
  participantId: string,
): Promise<PreFilterResult> {
  const trimmed = text.trim();

  // 1. Empty / whitespace-only → silently drop (not stored)
  if (trimmed.length === 0) {
    return { action: "drop" };
  }

  // 2. Under MIN_MESSAGE_LENGTH → silently drop (not stored)
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return { action: "drop" };
  }

  // 3. Over MAX_MESSAGE_LENGTH → drop message, respond with over-length bank message
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    const response = await getRandomMessageBank("over-length");
    return { action: "respond", response: response ?? "Your message is too long. Please keep it shorter." };
  }

  // 4. Participant rate limit → silently drop (not stored)
  const rateLimit = await checkParticipantRateLimit(eventCode, participantId);
  if (!rateLimit.allowed) {
    return { action: "drop" };
  }

  return { action: "pass" };
}

async function getRandomMessageBank(type: string): Promise<string | null> {
  const rows = await db
    .select({ content: schema.messageBanks.content })
    .from(schema.messageBanks)
    .where(
      and(
        eq(schema.messageBanks.type, type),
        eq(schema.messageBanks.is_active, true),
      ),
    );

  if (rows.length === 0) return null;
  const idx = Math.floor(Math.random() * rows.length);
  return rows[idx].content;
}
