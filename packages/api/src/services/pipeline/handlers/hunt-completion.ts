import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { ChatMessagePayload } from "@cityroam/shared/types";
import { db, schema } from "../../../db/index.js";
import { appendMessage, publishMessage, publishControl } from "../../../redis/index.js";
import { getRandomMessageBank } from "./answer-attempt.js";
import { env } from "../../../env.js";

/**
 * Context needed by the hunt-completion handler.
 */
export interface HuntCompletionContext {
  eventId: string;
  eventCode: string;
  routeId: string;
  currentStop: number;
}

/**
 * Handle hunt completion — triggered when last stop is solved or hints exhausted
 * with no next stop remaining.
 *
 * 1. Select random active completion template from message_banks
 * 2. Populate template variables: {{TOTAL_STOPS}}, {{DISTANCE_KM}}, {{CITY_NAME}}, {{REVIEW_LINK}}
 * 3. Update event: status = COMPLETED, completed_at = now
 * 4. Persist completion message to DB (as system message)
 * 5. Publish hunt_complete to Redis control channel
 * 6. Publish completion message to Redis messages channel
 */
export async function handleHuntCompletion(
  ctx: HuntCompletionContext,
): Promise<void> {
  // Load route data for template variables
  const route = await db.query.routes.findFirst({
    where: eq(schema.routes.id, ctx.routeId),
    columns: {
      total_stops: true,
      estimated_distance_km: true,
      city: true,
    },
  });

  if (!route) {
    console.error(`[hunt-completion] Route not found: ${ctx.routeId}`);
    return;
  }

  // Get completion template
  let completionMsg = await getRandomMessageBank("completion");
  completionMsg = completionMsg ?? "Congratulations! You've completed the hunt.";

  // Populate template variables
  completionMsg = completionMsg
    .replace("{{TOTAL_STOPS}}", String(route.total_stops))
    .replace("{{DISTANCE_KM}}", String(route.estimated_distance_km))
    .replace("{{CITY_NAME}}", route.city)
    .replace("{{REVIEW_LINK}}", env.REVIEW_LINK);

  // Update event: status = COMPLETED, completed_at = now
  await db
    .update(schema.events)
    .set({
      status: "COMPLETED",
      completed_at: sql`now()`,
    })
    .where(eq(schema.events.id, ctx.eventId));

  // Persist completion message as system message (not guide — don't increment guide_response_count)
  const [msg] = await db
    .insert(schema.messages)
    .values({
      event_id: ctx.eventId,
      step_number: ctx.currentStop,
      sender_type: "system",
      sender_name: "System",
      content: completionMsg,
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

  // Three-step write: DB done above → cache → pub/sub
  await appendMessage(ctx.eventCode, payload);
  await publishMessage(ctx.eventCode, payload);

  // Publish hunt_complete control event
  await publishControl(ctx.eventCode, {
    type: "hunt_complete",
    data: { summary: completionMsg },
  });
}
