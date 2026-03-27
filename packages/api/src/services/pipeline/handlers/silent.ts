import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "../../../db/index.js";
import { removeMessage } from "../../../redis/index.js";
import { writeGuideMessage, getRandomMessageBank } from "./answer-attempt.js";

/**
 * Context needed by silent/no-op handlers.
 */
export interface SilentHandlerContext {
  eventId: string;
  eventCode: string;
  currentStop: number;
  /** The DB message ID of the user's message (stored before classification). */
  messageId: string;
}

/**
 * Result from a silent/no-op handler.
 */
export interface SilentHandlerResult {
  handled: true;
  /** Whether the user's message was deleted (prompt-injection/inappropriate). */
  deleted: boolean;
}

/**
 * Handle an off-topic-chat message.
 *
 * No guide response. The user's message is already stored in DB by the orchestrator.
 */
export async function handleOffTopic(
  _ctx: SilentHandlerContext,
): Promise<SilentHandlerResult> {
  return { handled: true, deleted: false };
}

/**
 * Handle a contextual-comment message.
 *
 * No guide response. The user's message is already stored. Log the intent
 * for future analysis.
 */
export async function handleContextualComment(
  ctx: SilentHandlerContext,
): Promise<SilentHandlerResult> {
  console.log(
    `[contextual-comment] event=${ctx.eventCode} messageId=${ctx.messageId}`,
  );
  return { handled: true, deleted: false };
}

/**
 * Handle a prompt-injection message.
 *
 * Delete the user's message from DB and Redis cache. Log a hash of the content
 * (not the content itself) for monitoring.
 */
export async function handlePromptInjection(
  ctx: SilentHandlerContext,
  userMessage: string,
): Promise<SilentHandlerResult> {
  const contentHash = createHash("sha256")
    .update(userMessage)
    .digest("hex")
    .slice(0, 16);

  console.warn(
    `[prompt-injection] event=${ctx.eventCode} messageId=${ctx.messageId} hash=${contentHash}`,
  );

  // Delete from DB
  await db
    .delete(schema.messages)
    .where(eq(schema.messages.id, ctx.messageId));

  // Remove from Redis cache
  await removeMessage(ctx.eventCode, ctx.messageId);

  return { handled: true, deleted: true };
}

/**
 * Handle an inappropriate message.
 *
 * Delete the user's message from DB and Redis cache. Log for monitoring.
 */
export async function handleInappropriate(
  ctx: SilentHandlerContext,
): Promise<SilentHandlerResult> {
  console.warn(
    `[inappropriate] event=${ctx.eventCode} messageId=${ctx.messageId}`,
  );

  // Delete from DB
  await db
    .delete(schema.messages)
    .where(eq(schema.messages.id, ctx.messageId));

  // Remove from Redis cache
  await removeMessage(ctx.eventCode, ctx.messageId);

  return { handled: true, deleted: true };
}

/**
 * Handle a clarification intent.
 *
 * Select a random message from the "clarification" bank and send it as a
 * guide response.
 */
export async function handleClarification(
  ctx: SilentHandlerContext,
): Promise<SilentHandlerResult> {
  const content = await getRandomMessageBank("clarification");
  if (content) {
    await writeGuideMessage(
      ctx.eventId,
      ctx.eventCode,
      ctx.currentStop,
      content,
    );
  }
  return { handled: true, deleted: false };
}
