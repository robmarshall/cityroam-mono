import { createLogger } from "../../lib/logger.js";
import { eq } from "drizzle-orm";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
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
// Not re-exported from redis/index.js, so imported from the module directly —
// same as pre-filter.ts does for the participant limit.
import { checkGuideBusyNoticeRateLimit } from "../../redis/rate-limit.js";
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
  handleAnswerAttemptWithoutLLM,
  writeGuideMessage,
  SCRIPTED_MESSAGE,
} from "./handlers/answer-attempt.js";
import { handleHintRequest } from "./handlers/hint-request.js";
import { handleHintNudge } from "./handlers/hint-nudge.js";
import { handleQuestion } from "./handlers/question.js";
import {
  handleOffTopic,
  handleContextualComment,
  handlePromptInjection,
  handleInappropriate,
  handleClarification,
} from "./handlers/silent.js";
import type { SilentHandlerContext } from "./handlers/silent.js";
import {
  isAffirmativeResponse,
  isNegativeResponse,
  isHintRequest,
  isSkipRequest,
} from "./word-match.js";
import {
  classifyWithoutLLM,
  sendDegradedNotice,
  sendGuideBusyNotice,
} from "./degraded-mode.js";
import { withHealthTracking } from "./llm-health.js";
import { getRandomMessageBank } from "./handlers/answer-attempt.js";
import { buildEnRouteContext, type EnRouteContext } from "../enroute.js";

const log = createLogger("pipeline");

/**
 * Health-wrapped so that once the provider has failed a few times in a row,
 * calls return null immediately instead of each waiting out the 30s client
 * timeout. Every consumer of this instance — the classifier, the answer
 * matcher, the question handler — already treats null as "fall back to
 * scripted text", so the wrapper only makes that fallback fast.
 */
const llm = withHealthTracking(new DeepSeekService());

/**
 * Intents whose reply is conversational: an LLM-written answer, or a bank
 * line that only exists to acknowledge chatter. These are what the shared
 * per-event guide limit is for — several people talking at once must not turn
 * into several guide messages.
 *
 * Everything absent from this set bypasses the limit: answer attempts, hint
 * requests and hint nudges move the hunt along and must never be dropped,
 * off-topic and contextual chat produce no reply at all, and moderation has
 * to run on every message or a limited window becomes a way through the
 * filter.
 */
const RATE_LIMITED_INTENTS: ReadonlySet<string> = new Set([
  "question",
  "clarification",
  "degraded-notice",
]);

const HINT_DECLINE_FALLBACK: Record<SupportedLanguage, string> = {
  en: "No worries — keep at it!",
  es: "¡No te preocupes, sigue adelante!",
  fr: "Pas de souci — continuez comme ça !",
  de: "Kein Problem — mach weiter so!",
  nl: "Geen zorgen — ga zo door!",
};

/**
 * Everything the capped path needs from the event row.
 */
interface CappedEventContext {
  id: string;
  current_block_id: string | null;
  current_stop: number;
  wrong_attempts: number;
  hints_given: number;
}

/**
 * Handle a message on an event that has spent its guide response budget.
 *
 * The LLM is off limits, but both routes out of a block are scripted, so both
 * stay open: the deterministic matcher accepts a correct answer, and a
 * keyword-matched hint request serves the next hint — or, once hints run out,
 * reveals the answer and advances. Without the second route a group that
 * simply doesn't know the answer would still be stuck for good.
 *
 * Anything neither of those recognises gets the cap notice. Without
 * classification we can't tell an answer attempt from chatter, so nothing is
 * counted as a wrong attempt.
 */
async function handleMessageWhileCapped(
  event: CappedEventContext,
  eventCode: string,
  text: string,
  language: SupportedLanguage,
  enRoute: EnRouteContext | null,
): Promise<void> {
  const ctx = {
    eventId: event.id,
    eventCode,
    currentBlockId: event.current_block_id,
    currentStop: event.current_stop,
    wrongAttempts: event.wrong_attempts,
    hintsGiven: event.hints_given,
    language,
    enRoute,
  };

  // Answers win over hint keywords, so "stuck on this — is it the Town Hall?"
  // is still accepted as the answer it is.
  if (await handleAnswerAttemptWithoutLLM(ctx, text)) return;

  if (isHintRequest(text, language) || isSkipRequest(text, language)) {
    await handleHintRequest(ctx);
    return;
  }

  // The notice is the only noisy branch here, so it alone keeps the shared
  // guide rate limit. The two escape hatches above must never be dropped.
  const rateLimit = await checkGuideRateLimit(eventCode);
  if (!rateLimit.allowed) return;

  await sendCapReachedMessage(event.id, eventCode, event.current_stop, language);
}

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
      hint_offered: true,
      language: true,
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

  const rawLang = event.language ?? "en";
  const language: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang)
    ? (rawLang as SupportedLanguage)
    : "en";

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

  // Step 3b: Work out whether the group is walking between blocks.
  //
  // current_block_id is null for the whole post-answer sequence — the fun
  // facts, the map, the directions, the en-route commentary — which the
  // authoring guide encourages to run for several minutes. Without this the
  // handlers had no block context for that entire stretch and answered every
  // message with the clarification bank.
  const enRoute = event.current_block_id
    ? null
    : await buildEnRouteContext(eventId);

  // Step 4: Run Layer 1 pre-filter
  const preFilterResult = await preFilter(text, eventCode, participantId, language);

  if (preFilterResult.action === "drop") {
    updateIdleTimestamp(eventCode, eventId, language);
    return;
  }

  if (preFilterResult.action === "respond") {
    // Pre-filter responses are message-bank text, so they cost nothing and
    // stay available even on a capped event
    await writeGuideMessage(
      eventId,
      eventCode,
      event.current_stop,
      preFilterResult.response!,
      null,
      undefined,
      SCRIPTED_MESSAGE,
    );
    updateIdleTimestamp(eventCode, eventId, language);
    return;
  }

  // Step 5: Check if a hint was offered and this is a confirmation/decline.
  // Deterministic and scripted, so it runs ahead of the rate limit — and it
  // fires at most once per offer, since the flag is cleared immediately.
  if (event.hint_offered) {
    // Clear the flag regardless of response
    await db
      .update(schema.events)
      .set({ hint_offered: false })
      .where(eq(schema.events.id, eventId));

    if (isAffirmativeResponse(text, language)) {
      // Player confirmed — serve the hint (no LLM needed)
      await publishTyping(eventCode, {
        type: "guide_typing",
        participant_name: null,
        participant_id: null,
        is_typing: true,
      });
      try {
        await handleHintRequest({
          eventId,
          eventCode,
          currentBlockId: event.current_block_id,
          currentStop: event.current_stop,
          hintsGiven: event.hints_given,
          language,
          enRoute,
        });
      } finally {
        await publishTyping(eventCode, {
          type: "guide_typing",
          participant_name: null,
          participant_id: null,
          is_typing: false,
        });
      }
      updateIdleTimestamp(eventCode, eventId, language);
      return;
    }

    if (isNegativeResponse(text, language)) {
      // Player declined — send encouraging message (no LLM needed)
      await publishTyping(eventCode, {
        type: "guide_typing",
        participant_name: null,
        participant_id: null,
        is_typing: true,
      });
      try {
        const declineMsg = await getRandomMessageBank("hint-decline", language);
        const content = declineMsg ?? (HINT_DECLINE_FALLBACK[language] ?? HINT_DECLINE_FALLBACK.en);
        await writeGuideMessage(
          eventId,
          eventCode,
          event.current_stop,
          content,
          null,
          undefined,
          SCRIPTED_MESSAGE,
        );
      } finally {
        await publishTyping(eventCode, {
          type: "guide_typing",
          participant_name: null,
          participant_id: null,
          is_typing: false,
        });
      }
      updateIdleTimestamp(eventCode, eventId, language);
      return;
    }

    // TODO: Neither affirmative nor negative — fall through to normal classification.
    // The player may have ignored the hint offer and sent an answer or other message.
  }

  // Step 6: Guide response cap. No more LLM work, but answers and hints still
  // have to land — otherwise a capped event could never be finished. Checked
  // before the rate limit because those escape hatches do no LLM work, and
  // dropping one because a teammate typed 4 seconds ago would make the only
  // way out of a capped hunt intermittent.
  if (await isGuideResponseCapReached(eventId)) {
    await handleMessageWhileCapped(event, eventCode, text, language, enRoute);
    updateIdleTimestamp(eventCode, eventId, language);
    return;
  }

  // Step 7: Publish guide typing on.
  //
  // The shared guide rate limit used to sit here, ahead of classification,
  // which meant a correct answer sent two seconds after a teammate's chatter
  // was dropped with no reply and no error. It now runs after classification
  // (step 11) and only for conversational intents, so answers and hint
  // requests are never swallowed.
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
    } else if (enRoute?.nextQuestionConfig) {
      // Mid-walk the classifier has no clue to work from, which made every
      // early answer look like chatter. The question they are walking towards
      // is the right yardstick — it only ever reaches the classifier, never
      // the players.
      currentClue = enRoute.nextQuestionConfig.clue;
      acceptedAnswers = enRoute.nextQuestionConfig.accepted_answers;
    }

    // Step 9: Run Layer 2 intent classification
    const classification = await classifyIntent(llm, currentClue, text, language);

    // Classifier unavailable → degraded mode. The keyword matchers keep the
    // two scripted routes out of a block open (answer, hint/skip); anything
    // else gets a notice saying so, rather than a clarification line that
    // would repeat forever while the provider is down.
    let intent: string;
    if (classification !== null) {
      intent = classification.type;
    } else {
      intent = classifyWithoutLLM(text, acceptedAnswers, language);
      log.warn("classifier unavailable, using degraded intent", { eventCode, intent });
    }

    // Step 10: Re-check cap before sending handler response
    if (intent !== "off-topic-chat" && intent !== "contextual-comment") {
      if (await isGuideResponseCapReached(eventId)) {
        await handleMessageWhileCapped(event, eventCode, text, language, enRoute);
        updateIdleTimestamp(eventCode, eventId, language);
        return;
      }
    }

    // Step 11: Shared guide rate limit, conversational replies only. A group
    // talking over itself shouldn't get a wall of guide messages, but nothing
    // that moves the hunt along passes through here.
    if (RATE_LIMITED_INTENTS.has(intent)) {
      const guideRateLimit = await checkGuideRateLimit(eventCode);
      if (!guideRateLimit.allowed) {
        // Silence is the wrong answer for a player who asked something, so
        // send a cheap bank line instead — but only as often as the coarser
        // notice limit allows, or a chatty group just gets different spam.
        // In degraded mode the notice would restate the message a teammate
        // just triggered, so that case stays quiet.
        if (intent !== "degraded-notice") {
          const notice = await checkGuideBusyNoticeRateLimit(eventCode);
          if (notice.allowed) {
            await sendGuideBusyNotice(eventId, eventCode, event.current_stop, language);
          }
        }
        log.info("conversational reply rate limited", { eventCode, intent });
        updateIdleTimestamp(eventCode, eventId, language);
        return;
      }
    }

    // Step 12: Route to handler
    const silentCtx: SilentHandlerContext = {
      eventId,
      eventCode,
      currentStop: event.current_stop,
      messageId: userMsg.id,
      language,
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
            language,
            enRoute,
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
          language,
          enRoute,
        });
        break;

      case "hint-nudge":
        await handleHintNudge({
          eventId,
          eventCode,
          currentStop: event.current_stop,
          language,
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
            language,
            enRoute,
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

      case "degraded-notice": {
        // Only reachable while the classifier is unavailable. Bank text, so
        // it costs no LLM call and no guide-response budget.
        await sendDegradedNotice(eventId, eventCode, event.current_stop, language);
        break;
      }
    }

    // Step 13: Update idle timer
    const wasPaused = updateIdleTimestamp(eventCode, eventId, language);
    if (wasPaused) {
      await handleIdleResume(eventId, eventCode, language);
    }

    // Step 14: Remove from idle tracking if game completed during this pipeline run
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
    // Step 15: Always turn off guide typing
    await publishTyping(eventCode, {
      type: "guide_typing",
      participant_name: null,
      participant_id: null,
      is_typing: false,
    });
  }
}
