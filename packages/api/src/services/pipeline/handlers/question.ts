import { eq } from "drizzle-orm";
import type { QuestionBlockConfig } from "@cityroam/shared/types";
import type { LLMService } from "../../llm/interface.js";
import { db, schema } from "../../../db/index.js";
import { writeGuideMessage, getRandomMessageBank } from "./answer-attempt.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("question");

/**
 * Context needed by the question handler.
 */
export interface QuestionContext {
  eventId: string;
  eventCode: string;
  routeId: string;
  currentBlockId: string | null;
  currentStop: number;
}

/**
 * Result from the question handler.
 */
export interface QuestionResult {
  handled: true;
}

/**
 * Build the LLM prompt for answering a player's question.
 */
function buildQuestionPrompt(
  cityName: string,
  currentStopNumber: number,
  totalStops: number,
  clue: string,
  estimatedDistanceRemaining: string,
  userMessage: string,
): string {
  return `You are the guide for a city exploration game in ${cityName}. A player has asked you a direct question. Answer using ONLY the information provided below. If you cannot answer from the information given, respond with exactly: {"type": "unknown"}

Otherwise respond with: {"type": "answer", "text": "<your response>"}

Your response text should match the guide's tone: dry, brief, knowledgeable. 2 sentences maximum. No exclamation marks. No excessive enthusiasm.

Current stop: Stop ${currentStopNumber} of ${totalStops}
Clue: "${clue}"
Estimated distance remaining: ${estimatedDistanceRemaining}

Player's question: "${userMessage}"`;
}

/**
 * Handle a question message.
 *
 * Sends the question to DeepSeek with the current question block's context.
 * - On {"type": "answer", "text": "..."} → send text as guide message
 * - On {"type": "unknown"} → select from "unknown-answer" message bank
 * - On JSON parse failure → select from "clarification" bank
 * - On LLM timeout → select from "clarification" bank
 */
export async function handleQuestion(
  llm: LLMService,
  ctx: QuestionContext,
  userMessage: string,
): Promise<QuestionResult> {
  if (!ctx.currentBlockId) {
    log.error("no current block id", { eventId: ctx.eventId });
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true };
  }

  // Load current question block
  const currentBlock = await db.query.routeBlocks.findFirst({
    where: eq(schema.routeBlocks.id, ctx.currentBlockId),
    columns: { type: true, config: true },
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
    return { handled: true };
  }

  const config = currentBlock.config as QuestionBlockConfig;

  // Load route data for city name and total stops
  const routeData = await db.query.routes.findFirst({
    where: eq(schema.routes.id, ctx.routeId),
  });

  if (!routeData) {
    log.error("route not found", { routeId: ctx.routeId });
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true };
  }

  // Calculate estimated distance remaining (rough: proportional to stops remaining)
  const stopsRemaining = routeData.total_stops - ctx.currentStop + 1;
  const distancePerStop =
    Number(routeData.estimated_distance_km) / routeData.total_stops;
  const estimatedDistanceRemaining = `${(stopsRemaining * distancePerStop).toFixed(1)} km`;

  const prompt = buildQuestionPrompt(
    routeData.city,
    ctx.currentStop,
    routeData.total_stops,
    config.clue,
    estimatedDistanceRemaining,
    userMessage,
  );

  const result = await llm.classify(prompt);

  // LLM failure / timeout → clarification bank
  if (result === null) {
    log.error("LLM returned null", { reason: "timeout or failure" });
    const clarification = await getRandomMessageBank("clarification");
    if (clarification) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, clarification);
    }
    return { handled: true };
  }

  // Parse the result
  const parsed = result as Record<string, unknown>;

  if (parsed.type === "answer" && typeof parsed.text === "string") {
    // LLM answered the question
    await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, parsed.text);
    return { handled: true };
  }

  if (parsed.type === "unknown") {
    // LLM cannot answer from provided info → unknown-answer bank
    const unknownMsg = await getRandomMessageBank("unknown-answer");
    if (unknownMsg) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, unknownMsg);
    }
    return { handled: true };
  }

  // Invalid JSON structure → clarification bank
  log.error("invalid LLM result", { result: JSON.stringify(result) });
  const clarification = await getRandomMessageBank("clarification");
  if (clarification) {
    await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, clarification);
  }
  return { handled: true };
}
