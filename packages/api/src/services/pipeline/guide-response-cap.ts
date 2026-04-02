import { eq, sql } from "drizzle-orm";
import { MAX_GUIDE_RESPONSES_PER_EVENT } from "@cityroam/shared/constants";
import type { ChatMessagePayload } from "@cityroam/shared/types";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { db, schema } from "../../db/index.js";
import { appendMessage, publishMessage } from "../../redis/index.js";

/** Per-language guide cap messages. */
const CAP_MESSAGES: Record<SupportedLanguage, string> = {
  en: "The guide has reached its message limit for this event.",
  es: "El guía ha alcanzado su límite de mensajes para este evento.",
  fr: "Le guide a atteint sa limite de messages pour cet événement.",
  de: "Der Guide hat sein Nachrichtenlimit für dieses Event erreicht.",
  nl: "De gids heeft de berichtenlimiet voor dit evenement bereikt.",
};

/**
 * Check whether the guide response cap has been reached for an event.
 * Returns true if guide_response_count >= MAX_GUIDE_RESPONSES_PER_EVENT.
 */
export async function isGuideResponseCapReached(
  eventId: string,
): Promise<boolean> {
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    columns: { guide_response_count: true },
  });

  if (!event) return true; // Defensive — treat missing event as capped
  return event.guide_response_count >= MAX_GUIDE_RESPONSES_PER_EVENT;
}

/**
 * Send a system message informing participants the guide has reached its
 * message limit. Uses sender_type "system" and does NOT increment
 * guide_response_count — the cap notification itself is not a guide response.
 */
export async function sendCapReachedMessage(
  eventId: string,
  eventCode: string,
  currentStop: number,
  language: SupportedLanguage = "en",
): Promise<void> {
  const [msg] = await db
    .insert(schema.messages)
    .values({
      event_id: eventId,
      step_number: currentStop,
      sender_type: "system",
      sender_name: "System",
      content: CAP_MESSAGES[language] ?? CAP_MESSAGES.en,
      participant_id: null,
      image_url: null,
    })
    .returning();

  const payload: ChatMessagePayload = {
    id: msg.id,
    sender_type: msg.sender_type as ChatMessagePayload["sender_type"],
    sender_name: msg.sender_name,
    participant_id: msg.participant_id,
    content: msg.content,
    image_url: msg.image_url ?? null,
    step_number: msg.step_number,
    created_at: new Date(msg.created_at).toISOString(),
  };

  await appendMessage(eventCode, payload);
  await publishMessage(eventCode, payload);
}

/**
 * Atomically increment guide_response_count on the event row.
 * Called after each guide message is written.
 */
export async function incrementGuideResponseCount(
  eventId: string,
): Promise<void> {
  await db
    .update(schema.events)
    .set({
      guide_response_count: sql`${schema.events.guide_response_count} + 1`,
    })
    .where(eq(schema.events.id, eventId));
}
