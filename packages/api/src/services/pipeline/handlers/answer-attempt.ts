import { eq, and } from "drizzle-orm";
import type { ChatMessagePayload } from "@cityroam/shared/types";
import type { AnswerMatchResult } from "@cityroam/shared/types";
import { buildS3Key, buildS3Url } from "@cityroam/shared/utils";
import type { LLMService } from "../../llm/interface.js";
import { db, schema } from "../../../db/index.js";
import { appendMessage, publishMessage } from "../../../redis/index.js";
import { incrementGuideResponseCount } from "../guide-response-cap.js";
import { handleGameCompletion } from "./game-completion.js";
import { env } from "../../../env.js";
import { createLogger } from "../../../lib/logger.js";
import { deterministicAnswerMatch } from "../deterministic-match.js";

const log = createLogger("answer-attempt");

/**
 * Context needed by the answer-attempt handler.
 */
export interface AnswerAttemptContext {
  eventId: string;
  eventCode: string;
  routeId: string;
  currentStop: number;
  wrongAttempts: number;
  hintsGiven: number;
}

/**
 * Result from the answer-attempt handler.
 */
export interface AnswerAttemptResult {
  handled: true;
  correct: boolean;
}

/**
 * Build the LLM prompt for answer matching.
 */
function buildAnswerMatchPrompt(
  currentClue: string,
  acceptedAnswers: string[],
  userMessage: string,
): string {
  return `You are an answer checker for a city exploration game. Your only job is to decide whether the player's message is a correct answer to the current clue.

Clue: "${currentClue}"
Accepted answers: ${JSON.stringify(acceptedAnswers)}

Matching rules:
- Ignore case.
- Accept minor spelling errors (1–2 character transpositions or omissions).
- Accept common abbreviations (e.g. "St" for "Saint", "Rd" for "Road").
- Accept the answer embedded in a sentence (e.g. "I think it's the Town Hall" matches "Town Hall").
- Ignore leading/trailing articles ("the", "a", "an").
- Do NOT accept answers that are only vaguely related or thematically similar but factually different.

Respond with ONLY one of:
{"type": "answer-correct"}
{"type": "answer-incorrect"}

No other text. No explanation. No markdown.

Player message: "${userMessage}"`;
}

/**
 * Persist a guide message using the three-step write sequence: DB → cache → pub/sub.
 * Returns the created message payload.
 */
export async function writeGuideMessage(
  eventId: string,
  eventCode: string,
  stepNumber: number,
  content: string,
  imageUrl: string | null = null,
): Promise<ChatMessagePayload> {
  const [msg] = await db
    .insert(schema.messages)
    .values({
      event_id: eventId,
      step_number: stepNumber,
      sender_type: "guide",
      sender_name: "Guide",
      content,
      participant_id: null,
      image_url: imageUrl,
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

  // Increment guide response count after each guide message
  await incrementGuideResponseCount(eventId);

  return payload;
}

/**
 * Get a random active message from the specified bank type.
 */
export async function getRandomMessageBank(type: string): Promise<string | null> {
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

/**
 * Handle an answer-attempt message.
 *
 * Calls the LLM to check if the player's answer matches, then:
 * - On correct: success bank + fun fact + directions/clue for next stop + images, advance stop
 * - On incorrect: failure bank + hint nudge after 3 wrongs with 0 hints
 * - On LLM parse failure: clarification bank (answer attempts are never silently dropped)
 */
export async function handleAnswerAttempt(
  llm: LLMService,
  ctx: AnswerAttemptContext,
  userMessage: string,
): Promise<AnswerAttemptResult> {
  // Load current stop data
  const currentStopData = await db.query.stops.findFirst({
    where: and(
      eq(schema.stops.route_id, ctx.routeId),
      eq(schema.stops.stop_number, ctx.currentStop),
    ),
  });

  if (!currentStopData) {
    log.error("stop not found", { routeId: ctx.routeId, currentStop: ctx.currentStop });
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true, correct: false };
  }

  const acceptedAnswers = currentStopData.accepted_answers as string[];

  // Call LLM for answer matching
  const prompt = buildAnswerMatchPrompt(
    currentStopData.clue,
    acceptedAnswers,
    userMessage,
  );
  const result = await llm.classify(prompt);

  // Parse the result
  let matchResult: AnswerMatchResult | null = null;

  if (result !== null) {
    const parsed = result as Record<string, unknown>;
    if (
      parsed.type === "answer-correct" ||
      parsed.type === "answer-incorrect"
    ) {
      matchResult = { type: parsed.type };
    }
  }

  // LLM failure → use deterministic fallback instead of clarification
  if (matchResult === null) {
    log.warn("LLM answer match failed, using deterministic fallback");
    const isMatch = deterministicAnswerMatch(userMessage, acceptedAnswers);
    matchResult = { type: isMatch ? "answer-correct" : "answer-incorrect" };
  }

  if (matchResult.type === "answer-correct") {
    await handleCorrectAnswer(ctx, currentStopData);
    return { handled: true, correct: true };
  } else {
    await handleIncorrectAnswer(ctx);
    return { handled: true, correct: false };
  }
}

/**
 * Handle a correct answer:
 * 1. Success bank message + fun fact
 * 2. Next stop directions + clue (if not last stop)
 * 3. Image messages for next stop
 * 4. Update event: increment current_stop, reset hints_given and wrong_attempts
 */
async function handleCorrectAnswer(
  ctx: AnswerAttemptContext,
  currentStopData: typeof schema.stops.$inferSelect,
): Promise<void> {
  // 1. Success message
  const successMsg = await getRandomMessageBank("success");
  const successContent = successMsg ?? "Correct!";
  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, successContent);

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
  } else {
    // Last stop completed — trigger game completion
    await handleGameCompletion({
      eventId: ctx.eventId,
      eventCode: ctx.eventCode,
      routeId: ctx.routeId,
      currentStop: ctx.currentStop,
    });
  }

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

/**
 * Handle an incorrect answer:
 * 1. Increment wrong_attempts
 * 2. Failure bank message
 * 3. Hint nudge after 3+ wrong attempts with 0 hints given
 */
async function handleIncorrectAnswer(
  ctx: AnswerAttemptContext,
): Promise<void> {
  const newWrongAttempts = ctx.wrongAttempts + 1;

  // Update wrong_attempts on the event
  await db
    .update(schema.events)
    .set({ wrong_attempts: newWrongAttempts })
    .where(eq(schema.events.id, ctx.eventId));

  // Get failure message
  let failureMsg = await getRandomMessageBank("failure");
  failureMsg = failureMsg ?? "That's not quite right. Try again!";

  // Append hint nudge if 3+ wrong attempts and no hints used
  if (newWrongAttempts >= 3 && ctx.hintsGiven === 0) {
    failureMsg += " You might want to ask for a hint.";
  }

  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, failureMsg);
}

export { buildAnswerMatchPrompt };
