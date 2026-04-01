import { createLogger } from "../../lib/logger.js";
import { eq } from "drizzle-orm";
import type {
  IncomingMessagePayload,
  ChatMessagePayload,
  QuestionBlockConfig,
} from "@cityroam/shared/types";
import { db, schema } from "../../db/index.js";
import {
  appendMessage,
  publishMessage,
  publishTyping,
  checkGuideRateLimit,
} from "../../redis/index.js";
import { DeepSeekService } from "../llm/deepseek.js";
import { preFilter } from "./pre-filter.js";
import { classifyIntent } from "./classifier.js";
import {
  isGuideResponseCapReached,
  sendCapReachedMessage,
} from "./guide-response-cap.js";
import {
  updateIdleTimestamp,
  handleIdleResume,
  removeFromIdleTracking,
} from "./idle-timer.js";
import {
  handleAnswerAttempt,
  writeGuideMessage,
} from "./handlers/answer-attempt.js";
import { handleHintRequest } from "./handlers/hint-request.js";
import { handleQuestion } from "./handlers/question.js";
import {
  handleOffTopic,
  handleContextualComment,
  handlePromptInjection,
  handleInappropriate,
  handleClarification,
} from "./handlers/silent.js";
import type { SilentHandlerContext } from "./handlers/silent.js";
import { deterministicAnswerMatch } from "./deterministic-match.js";

const log = createLogger("pipeline");
const llm = new DeepSeekService();

/**
 * Main entry point for the AI guide pipeline.
 * Receives incoming user messages from the Redis subscriber and
 * processes them through the full pipeline:
 *   store → broadcast → pre-filter → classify → handler → respond
 */
export async function processIncomingMessage(
  payload: IncomingMessagePayload,
): Promise<void> {
  const {
    event_id: eventId,
    event_code: eventCode,
    participant_id: participantId,
    participant_name: participantName,
    text,
    message_id: incomingMessageId,
    timestamp,
  } = payload;

  log.info("received message", { participantName, eventCode, messageId: incomingMessageId });

  // Step 1: Load event data
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    columns: {
      id: true,
      status: true,
      route_id: true,
      current_stop: true,
      current_block_id: true,
      current_group_id: true,
      hints_given: true,
      wrong_attempts: true,
      guide_response_count: true,
    },
  });

  if (!event) {
    log.error("event not found", { eventId });
    return;
  }

  // Step 2: Check event is IN_PROGRESS
  if (event.status !== "IN_PROGRESS") {
    log.info("ignoring message for non-active event", { eventCode, status: event.status });
    return;
  }

  // Step 3: Store user message (three-step write: DB → cache → pub/sub)
  const [userMsg] = await db
    .insert(schema.messages)
    .values({
      event_id: eventId,
      step_number: event.current_stop,
      sender_type: "user",
      sender_name: participantName,
      content: text,
      participant_id: participantId,
      image_url: null,
    })
    .returning();

  const userMsgPayload: ChatMessagePayload = {
    id: userMsg.id,
    sender_type: userMsg.sender_type as ChatMessagePayload["sender_type"],
    sender_name: userMsg.sender_name,
    participant_id: userMsg.participant_id,
    content: userMsg.content,
    image_url: userMsg.image_url ?? null,
    step_number: userMsg.step_number,
    created_at: new Date(userMsg.created_at).toISOString(),
  };

  await appendMessage(eventCode, userMsgPayload);
  await publishMessage(eventCode, userMsgPayload);

  // Step 4: Run Layer 1 pre-filter
  const preFilterResult = await preFilter(text, eventCode, participantId);

  if (preFilterResult.action === "drop") {
    updateIdleTimestamp(eventCode, eventId);
    return;
  }

  if (preFilterResult.action === "respond") {
    if (!(await isGuideResponseCapReached(eventId))) {
      await writeGuideMessage(
        eventId,
        eventCode,
        event.current_stop,
        preFilterResult.response!,
      );
    }
    updateIdleTimestamp(eventCode, eventId);
    return;
  }

  // Step 5: Check guide response cap before LLM work
  if (await isGuideResponseCapReached(eventId)) {
    await sendCapReachedMessage(eventId, eventCode, event.current_stop);
    updateIdleTimestamp(eventCode, eventId);
    return;
  }

  // Step 6: Check guide rate limit
  const guideRateLimit = await checkGuideRateLimit(eventCode);
  if (!guideRateLimit.allowed) {
    updateIdleTimestamp(eventCode, eventId);
    return;
  }

  // Step 7: Publish guide typing on
  await publishTyping(eventCode, {
    type: "guide_typing",
    participant_name: null,
    participant_id: null,
    is_typing: true,
  });

  try {
    // Step 8: Load current question block for classification
    let currentClue = "";
    let acceptedAnswers: string[] = [];

    if (event.current_block_id) {
      const currentBlock = await db.query.routeBlocks.findFirst({
        where: eq(schema.routeBlocks.id, event.current_block_id),
        columns: { type: true, config: true },
      });

      if (currentBlock?.type === "question") {
        const config = currentBlock.config as QuestionBlockConfig;
        currentClue = config.clue;
        acceptedAnswers = config.accepted_answers;
      }
    }

    // Step 9: Run Layer 2 intent classification
    const classification = await classifyIntent(llm, currentClue, text);

    // LLM failure → try deterministic answer match before falling back to clarification
    let intent: string;
    if (classification !== null) {
      intent = classification.type;
    } else {
      if (acceptedAnswers.length > 0 && deterministicAnswerMatch(text, acceptedAnswers)) {
        log.info("LLM down, deterministic match hit", { eventCode });
        intent = "answer-attempt";
      } else {
        intent = "clarification";
      }
    }

    // Step 10: Re-check cap before sending handler response
    if (intent !== "off-topic-chat" && intent !== "contextual-comment") {
      if (await isGuideResponseCapReached(eventId)) {
        await sendCapReachedMessage(eventId, eventCode, event.current_stop);
        updateIdleTimestamp(eventCode, eventId);
        return;
      }
    }

    // Step 11: Route to handler
    const silentCtx: SilentHandlerContext = {
      eventId,
      eventCode,
      currentStop: event.current_stop,
      messageId: userMsg.id,
    };

    switch (intent) {
      case "answer-attempt":
        await handleAnswerAttempt(
          llm,
          {
            eventId,
            eventCode,
            currentBlockId: event.current_block_id,
            currentStop: event.current_stop,
            wrongAttempts: event.wrong_attempts,
            hintsGiven: event.hints_given,
          },
          text,
        );
        break;

      case "hint-request":
        await handleHintRequest({
          eventId,
          eventCode,
          currentBlockId: event.current_block_id,
          currentStop: event.current_stop,
          hintsGiven: event.hints_given,
        });
        break;

      case "question":
        await handleQuestion(
          llm,
          {
            eventId,
            eventCode,
            routeId: event.route_id,
            currentBlockId: event.current_block_id,
            currentStop: event.current_stop,
          },
          text,
        );
        break;

      case "off-topic-chat": {
        await handleOffTopic(silentCtx);
        break;
      }

      case "contextual-comment": {
        await handleContextualComment(silentCtx);
        break;
      }

      case "prompt-injection": {
        await handlePromptInjection(silentCtx, text);
        break;
      }

      case "inappropriate": {
        await handleInappropriate(silentCtx);
        break;
      }

      case "clarification": {
        await handleClarification(silentCtx);
        break;
      }
    }

    // Step 12: Update idle timer
    const wasPaused = updateIdleTimestamp(eventCode, eventId);
    if (wasPaused) {
      await handleIdleResume(eventId, eventCode);
    }

    // Step 13: Remove from idle tracking if game completed during this pipeline run
    const updatedEvent = await db.query.events.findFirst({
      where: eq(schema.events.id, eventId),
      columns: { status: true },
    });
    if (updatedEvent?.status === "COMPLETED") {
      removeFromIdleTracking(eventCode);
    }
  } catch (error) {
    log.error("pipeline error", { messageId: incomingMessageId, eventCode, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    throw error;
  } finally {
    // Step 14: Always turn off guide typing
    await publishTyping(eventCode, {
      type: "guide_typing",
      participant_name: null,
      participant_id: null,
      is_typing: false,
    });
  }
}
