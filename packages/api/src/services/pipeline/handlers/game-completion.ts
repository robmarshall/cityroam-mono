import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { ChatMessagePayload } from "@cityroam/shared/types";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { db, schema } from "../../../db/index.js";
import { appendMessage, publishMessage, publishControl, deleteSessionsByEventId } from "../../../redis/index.js";
import { getRandomMessageBank } from "./answer-attempt.js";
import { applyTemplateVars, buildRouteTemplateVars } from "../../template-vars.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("game-completion");

/**
 * Context needed by the game-completion handler.
 */
export interface GameCompletionContext {
  eventId: string;
  eventCode: string;
  routeId: string;
  currentStop: number;
  language: SupportedLanguage;
}

const COMPLETION_FALLBACK: Record<SupportedLanguage, string> = {
  en: "Congratulations! You've completed the game.",
  es: "¡Felicidades! Has completado el juego.",
  fr: "Félicitations ! Vous avez terminé le jeu.",
  de: "Herzlichen Glückwunsch! Du hast das Spiel abgeschlossen.",
  nl: "Gefeliciteerd! Je hebt het spel voltooid.",
};

/**
 * Handle game completion — triggered when last group's last block completes,
 * or when hints are exhausted on the final question.
 *
 * 1. Select random active completion template from message_banks
 * 2. Populate template variables via buildRouteTemplateVars
 * 3. Update event: status = COMPLETED, completed_at = now
 * 4. Persist completion message to DB (as system message)
 * 5. Publish game_complete to Redis control channel
 * 6. Publish completion message to Redis messages channel
 */
export async function handleGameCompletion(
  ctx: GameCompletionContext,
): Promise<void> {
  // Build template variables from route
  const templateVars = await buildRouteTemplateVars(ctx.routeId);

  if (Object.keys(templateVars).length === 0) {
    log.error("route not found", { routeId: ctx.routeId });
    return;
  }

  // Get completion template
  let completionMsg = await getRandomMessageBank("completion", ctx.language);
  completionMsg = completionMsg ?? (COMPLETION_FALLBACK[ctx.language] ?? COMPLETION_FALLBACK.en);

  // Apply template variables
  completionMsg = applyTemplateVars(completionMsg, templateVars);

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

  // Invalidate sessions AFTER all DB writes complete so a failed insert doesn't leave orphaned state
  try {
    await deleteSessionsByEventId(ctx.eventId);
  } catch (err) {
    log.warn("Failed to invalidate sessions after completion", { eventId: ctx.eventId, err });
  }

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

  // Publish game_complete control event
  await publishControl(ctx.eventCode, {
    type: "game_complete",
    data: { summary: completionMsg },
  });
}
