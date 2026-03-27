import type { IncomingMessagePayload } from "@cityroam/shared/types";

/**
 * Main entry point for the AI guide pipeline.
 * Receives incoming user messages from the Redis subscriber and
 * processes them through the full pipeline:
 *   store → broadcast → pre-filter → classify → handler → respond
 *
 * TODO: Full implementation in task 4.11
 */
export async function processIncomingMessage(
  payload: IncomingMessagePayload,
): Promise<void> {
  console.log(
    `[pipeline] received message from ${payload.participant_name} in event ${payload.event_code}: ${payload.message_id}`,
  );
}
