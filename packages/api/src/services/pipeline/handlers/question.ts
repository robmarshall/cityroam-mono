import { eq, and } from "drizzle-orm";
import type { LLMService } from "../../llm/interface.js";
import { db, schema } from "../../../db/index.js";
import { writeGuideMessage, getRandomMessageBank } from "./answer-attempt.js";

/**
 * Context needed by the question handler.
 */
export interface QuestionContext {
  eventId: string;
  eventCode: string;
  routeId: string;
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
  stopName: string,
  clue: string,
  directionsFromPrevious: string,
  directionsToNext: string | null,
  estimatedDistanceRemaining: string,
  hasMapsLink: boolean,
  userMessage: string,
): string {
  return `You are the guide for a treasure hunt in ${cityName}. A player has asked you a direct question. Answer using ONLY the information provided below. If you cannot answer from the information given, respond with exactly: {"type": "unknown"}

Otherwise respond with: {"type": "answer", "text": "<your response>"}

Your response text should match the guide's tone: dry, brief, knowledgeable. 2 sentences maximum. No exclamation marks. No excessive enthusiasm.

Current stop: Stop ${currentStopNumber} of ${totalStops} — "${stopName}"
Clue: "${clue}"
Directions to this stop from previous: "${directionsFromPrevious}"
Directions to next stop: "${directionsToNext ?? "N/A"}" (DO NOT reveal this unless the player has already solved the current clue)
Estimated distance remaining: ${estimatedDistanceRemaining}
Google Maps link available: ${hasMapsLink}

Player's question: "${userMessage}"`;
}

/**
 * Handle a question message.
 *
 * Sends the question to DeepSeek with the current stop's full structured data.
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
  // Load current stop data
  const currentStopData = await db.query.stops.findFirst({
    where: and(
      eq(schema.stops.route_id, ctx.routeId),
      eq(schema.stops.stop_number, ctx.currentStop),
    ),
  });

  if (!currentStopData) {
    console.error(
      `[question] Stop not found: route=${ctx.routeId} stop=${ctx.currentStop}`,
    );
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true };
  }

  // Load route data for city name and total stops
  const routeData = await db.query.routes.findFirst({
    where: eq(schema.routes.id, ctx.routeId),
  });

  if (!routeData) {
    console.error(`[question] Route not found: ${ctx.routeId}`);
    const fallback = await getRandomMessageBank("clarification");
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback);
    }
    return { handled: true };
  }

  // Load next stop for directions (if exists)
  const nextStop = await db.query.stops.findFirst({
    where: and(
      eq(schema.stops.route_id, ctx.routeId),
      eq(schema.stops.stop_number, ctx.currentStop + 1),
    ),
  });

  const directionsToNext = nextStop?.directions_from_previous ?? null;

  // Calculate estimated distance remaining (rough: proportional to stops remaining)
  const stopsRemaining = routeData.total_stops - ctx.currentStop + 1;
  const distancePerStop =
    Number(routeData.estimated_distance_km) / routeData.total_stops;
  const estimatedDistanceRemaining = `${(stopsRemaining * distancePerStop).toFixed(1)} km`;

  const prompt = buildQuestionPrompt(
    routeData.city,
    ctx.currentStop,
    routeData.total_stops,
    currentStopData.name,
    currentStopData.clue,
    currentStopData.directions_from_previous,
    directionsToNext,
    estimatedDistanceRemaining,
    !!currentStopData.google_maps_link,
    userMessage,
  );

  const result = await llm.classify(prompt);

  // LLM failure / timeout → clarification bank
  if (result === null) {
    console.error("[question] LLM returned null (timeout or failure)");
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
  console.error(`[question] Invalid LLM result: ${JSON.stringify(result)}`);
  const clarification = await getRandomMessageBank("clarification");
  if (clarification) {
    await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, clarification);
  }
  return { handled: true };
}
