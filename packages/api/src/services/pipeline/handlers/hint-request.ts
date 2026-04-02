import { eq } from "drizzle-orm";
import type { QuestionBlockConfig, SequenceItem } from "@cityroam/shared/types";
import { db, schema } from "../../../db/index.js";
import { writeGuideMessage, getRandomMessageBank } from "./answer-attempt.js";
import { advanceAfterBlock } from "../../group-runner.js";
import { sendSequence } from "../../send-sequence.js";
import { buildRouteTemplateVars } from "../../template-vars.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("hint-request");

/**
 * Context needed by the hint-request handler.
 */
export interface HintRequestContext {
  eventId: string;
  eventCode: string;
  currentBlockId: string | null;
  currentStop: number;
  hintsGiven: number;
}

/**
 * Result from the hint-request handler.
 */
export interface HintRequestResult {
  handled: true;
  exhausted: boolean;
}

/**
 * Handle a hint-request message.
 *
 * Programmatic — no LLM involved.
 * - If hints remain: serve hints[hints_given] as a sequence, increment hints_given
 * - If hints exhausted: reveal answer via hint-exhausted bank, reset counters,
 *   then call advanceAfterBlock() to continue the route
 */
export async function handleHintRequest(
  ctx: HintRequestContext,
): Promise<HintRequestResult> {
  if (!ctx.currentBlockId) {
    log.error("no current block id", { eventId: ctx.eventId });
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true, exhausted: false };
  }

  // Load current question block
  const currentBlock = await db.query.routeBlocks.findFirst({
    where: eq(schema.routeBlocks.id, ctx.currentBlockId),
    columns: { id: true, type: true, config: true },
  });

  if (!currentBlock || currentBlock.type !== "question") {
    log.error("current block not found or not a question", {
      blockId: ctx.currentBlockId,
      type: currentBlock?.type,
    });
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true, exhausted: false };
  }

  const config = currentBlock.config as QuestionBlockConfig;
  const hints: SequenceItem[][] = config.hints ?? [];

  // If hints remain, serve the next one as a sequence
  if (ctx.hintsGiven < hints.length) {
    const hintSequence = hints[ctx.hintsGiven];

    // Load template vars for hint content
    const event = await db.query.events.findFirst({
      where: eq(schema.events.id, ctx.eventId),
      columns: { route_id: true },
    });
    const templateVars = event ? await buildRouteTemplateVars(event.route_id) : {};

    await sendSequence(
      ctx.eventId,
      ctx.eventCode,
      ctx.currentStop,
      hintSequence,
      templateVars,
    );

    // Increment hints_given on the event
    await db
      .update(schema.events)
      .set({ hints_given: ctx.hintsGiven + 1 })
      .where(eq(schema.events.id, ctx.eventId));

    return { handled: true, exhausted: false };
  }

  // Hints exhausted — reveal the answer and advance
  await handleHintExhaustion(ctx, config);
  return { handled: true, exhausted: true };
}

/**
 * Handle hint exhaustion:
 * 1. Hint-exhausted bank message with {{ANSWER}} replaced
 * 2. Reset hints_given and wrong_attempts
 * 3. Call advanceAfterBlock() to continue the group/route
 */
async function handleHintExhaustion(
  ctx: HintRequestContext,
  config: QuestionBlockConfig,
): Promise<void> {
  const answer = config.accepted_answers[0] ?? "unknown";

  // 1. Hint-exhausted message with answer reveal
  let exhaustedMsg = await getRandomMessageBank("hint-exhausted");
  exhaustedMsg = exhaustedMsg ?? `The answer is ${answer}. Let's move on.`;
  exhaustedMsg = exhaustedMsg.replace("{{ANSWER}}", answer);
  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, exhaustedMsg);

  // 2. Reset counters
  await db
    .update(schema.events)
    .set({
      hints_given: 0,
      wrong_attempts: 0,
      hint_offered: false,
    })
    .where(eq(schema.events.id, ctx.eventId));

  // 3. Advance past the question block — sends remaining blocks in group, then next group
  await advanceAfterBlock(ctx.eventId, ctx.eventCode, ctx.currentBlockId!);
}
