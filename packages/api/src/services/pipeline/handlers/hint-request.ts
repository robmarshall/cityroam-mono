import { eq, and } from "drizzle-orm";
import { buildS3Key, buildS3Url } from "@cityroam/shared/utils";
import { db, schema } from "../../../db/index.js";
import { env } from "../../../env.js";
import { writeGuideMessage, getRandomMessageBank } from "./answer-attempt.js";

/**
 * Context needed by the hint-request handler.
 */
export interface HintRequestContext {
  eventId: string;
  eventCode: string;
  routeId: string;
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
 * - If hints remain: serve hints[hints_given], increment hints_given
 * - If hints exhausted: reveal answer via hint-exhausted bank, then advance stop
 *   using the same flow as answer-correct (fun fact, directions, next clue, images)
 */
export async function handleHintRequest(
  ctx: HintRequestContext,
): Promise<HintRequestResult> {
  // Load current stop data
  const currentStopData = await db.query.stops.findFirst({
    where: and(
      eq(schema.stops.route_id, ctx.routeId),
      eq(schema.stops.stop_number, ctx.currentStop),
    ),
  });

  if (!currentStopData) {
    console.error(
      `[hint-request] Stop not found: route=${ctx.routeId} stop=${ctx.currentStop}`,
    );
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true, exhausted: false };
  }

  const hints = (currentStopData.hints as string[]) ?? [];

  // If hints remain, serve the next one
  if (ctx.hintsGiven < hints.length) {
    const hint = hints[ctx.hintsGiven];
    await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, hint);

    // Increment hints_given on the event
    await db
      .update(schema.events)
      .set({ hints_given: ctx.hintsGiven + 1 })
      .where(eq(schema.events.id, ctx.eventId));

    return { handled: true, exhausted: false };
  }

  // Hints exhausted — reveal the answer and advance to next stop
  await handleHintExhaustion(ctx, currentStopData);
  return { handled: true, exhausted: true };
}

/**
 * Handle hint exhaustion:
 * 1. Hint-exhausted bank message with {{ANSWER}} replaced
 * 2. Fun fact for current stop
 * 3. Next stop directions + clue (if not last stop)
 * 4. Image messages for next stop
 * 5. Update event: advance stop, reset counters
 */
async function handleHintExhaustion(
  ctx: HintRequestContext,
  currentStopData: typeof schema.stops.$inferSelect,
): Promise<void> {
  const acceptedAnswers = currentStopData.accepted_answers as string[];
  const answer = acceptedAnswers[0] ?? "unknown";

  // 1. Hint-exhausted message with answer reveal
  let exhaustedMsg = await getRandomMessageBank("hint-exhausted");
  exhaustedMsg = exhaustedMsg ?? `The answer is ${answer}. Let's move on.`;
  exhaustedMsg = exhaustedMsg.replace("{{ANSWER}}", answer);
  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, exhaustedMsg);

  // 2. Fun fact
  await writeGuideMessage(
    ctx.eventId,
    ctx.eventCode,
    ctx.currentStop,
    currentStopData.fun_fact,
  );

  // 3. Check if there's a next stop
  const nextStopNumber = ctx.currentStop + 1;
  const nextStop = await db.query.stops.findFirst({
    where: and(
      eq(schema.stops.route_id, ctx.routeId),
      eq(schema.stops.stop_number, nextStopNumber),
    ),
  });

  if (nextStop) {
    // Send directions + next clue
    const directionsAndClue = `${nextStop.directions_from_previous}\n\n${nextStop.clue}`;
    await writeGuideMessage(ctx.eventId, ctx.eventCode, nextStopNumber, directionsAndClue);

    // Send images for the next stop
    const stopImages = (nextStop.images as string[]) ?? [];
    for (const image of stopImages) {
      const s3Key = buildS3Key(ctx.routeId, nextStopNumber, image);
      const imageUrl = buildS3Url(env.AWS_CDN_BASE_URL, s3Key);
      await writeGuideMessage(ctx.eventId, ctx.eventCode, nextStopNumber, "", imageUrl);
    }
  }
  // If no next stop → completion is handled by the orchestrator (task 4.9)

  // 4. Update event: advance stop, reset counters
  await db
    .update(schema.events)
    .set({
      current_stop: nextStopNumber,
      hints_given: 0,
      wrong_attempts: 0,
    })
    .where(eq(schema.events.id, ctx.eventId));
}
