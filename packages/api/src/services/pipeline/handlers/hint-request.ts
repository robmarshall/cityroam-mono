import { eq } from "drizzle-orm";
import type { QuestionBlockConfig, SequenceItem } from "@cityroam/shared/types";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { db, schema } from "../../../db/index.js";
import { writeGuideMessage, getRandomMessageBank, SCRIPTED_MESSAGE } from "./answer-attempt.js";
import { advanceAfterBlock } from "../../group-runner.js";
import { sendSequence } from "../../send-sequence.js";
import { buildRouteTemplateVars, applyTemplateVars } from "../../template-vars.js";
import { loadEnRouteTail, type EnRouteContext } from "../../enroute.js";
import { claimHint } from "../event-counters.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("hint-request");

const HINT_EXHAUSTED_FALLBACK: Record<SupportedLanguage, string> = {
  en: "The answer is {{ANSWER}}. Let's move on.",
  es: "La respuesta es {{ANSWER}}. Sigamos adelante.",
  fr: "La réponse est {{ANSWER}}. Continuons.",
  de: "Die Antwort ist {{ANSWER}}. Machen wir weiter.",
  nl: "Het antwoord is {{ANSWER}}. Laten we verder gaan.",
};

/**
 * Used when a hint is asked for during the walk. There is no clue to hint at
 * yet, so the guide points at the directions instead.
 */
const EN_ROUTE_HELP_FALLBACK: Record<SupportedLanguage, string> = {
  en: "You're between stops — nothing to solve yet. Here's the way again:",
  es: "Estáis entre paradas, aún no hay nada que resolver. Aquí tenéis el camino otra vez:",
  fr: "Vous êtes entre deux étapes, rien à résoudre pour l'instant. Voici le chemin à nouveau :",
  de: "Ihr seid zwischen zwei Stationen — noch nichts zu lösen. Hier ist der Weg noch einmal:",
  nl: "Jullie zijn onderweg tussen twee stops — nog niets op te lossen. Hier is de route nog een keer:",
};

/**
 * Same situation, but the group has no directions block to repeat.
 */
const EN_ROUTE_NO_DIRECTIONS_FALLBACK: Record<SupportedLanguage, string> = {
  en: "You're between stops — keep walking, the next clue arrives when you get there.",
  es: "Estáis entre paradas: seguid caminando, la siguiente pista llegará al llegar.",
  fr: "Vous êtes entre deux étapes : continuez à marcher, le prochain indice arrivera sur place.",
  de: "Ihr seid zwischen zwei Stationen — geht weiter, der nächste Hinweis kommt, wenn ihr da seid.",
  nl: "Jullie zijn onderweg — blijf lopen, de volgende aanwijzing komt zodra jullie er zijn.",
};

/** Message bank type for the en-route "here's the way again" lead-in. */
export const EN_ROUTE_HELP_BANK_TYPE = "en-route-help";

/**
 * Context needed by the hint-request handler.
 */
export interface HintRequestContext {
  eventId: string;
  eventCode: string;
  currentBlockId: string | null;
  currentStop: number;
  /**
   * The counter as it was when the message was picked up. Kept for logging
   * only — which hint to serve is decided by the atomic claim, never by this.
   */
  hintsGiven: number;
  language: SupportedLanguage;
  /** Set while the group is walking between blocks. */
  enRoute?: EnRouteContext | null;
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
 * - Parked on a question: claim the next hint atomically and serve it, or
 *   reveal the answer and advance once the hints run out
 * - Walking between blocks: repeat the directions, spending no hint
 */
export async function handleHintRequest(
  ctx: HintRequestContext,
): Promise<HintRequestResult> {
  if (!ctx.currentBlockId) {
    // Mid-walk. There is no live question, so there is no hint to spend —
    // serving the next block's hint here would burn a capped resource on a
    // clue the players have not even been given.
    if (ctx.enRoute) {
      await sendEnRouteHelp(ctx, ctx.enRoute);
      return { handled: true, exhausted: false };
    }

    log.error("no current block id", { eventId: ctx.eventId });
    const fallback = await getRandomMessageBank("clarification", ctx.language);
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback, null, undefined, SCRIPTED_MESSAGE);
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
    const fallback = await getRandomMessageBank("clarification", ctx.language);
    if (fallback) {
      await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, fallback, null, undefined, SCRIPTED_MESSAGE);
    }
    return { handled: true, exhausted: false };
  }

  const config = currentBlock.config as QuestionBlockConfig;
  const hints: SequenceItem[][] = config.hints ?? [];

  // Claim a hint before sending anything. The send below sleeps between
  // items, so deciding from a counter read minutes earlier let two players
  // asking at once both receive hint 1 and skip hint 2 entirely.
  const claimed = await claimHint(ctx.eventId, ctx.currentBlockId, hints.length);

  if (claimed === null) {
    // Either the group left the block while this message was in flight, or
    // another request already took the reveal. Both mean this one has nothing
    // to say — a second reveal would repeat the answer and race the advance.
    log.info("hint claim lost, staying quiet", {
      eventCode: ctx.eventCode,
      blockId: ctx.currentBlockId,
    });
    return { handled: true, exhausted: false };
  }

  // 1..hints.length selects a hint; hints.length + 1 is the exhaustion claim.
  if (claimed <= hints.length) {
    const hintSequence = hints[claimed - 1];

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

    return { handled: true, exhausted: false };
  }

  // Hints exhausted — reveal the answer and advance
  await handleHintExhaustion(ctx, config);
  return { handled: true, exhausted: true };
}

/**
 * Answer a hint request made while the group is walking.
 *
 * Repeats the directions and the map card for the leg they are on. No hint is
 * consumed and no counter moves: hints belong to the question they were
 * written for, and the group has not been asked it yet.
 */
async function sendEnRouteHelp(
  ctx: HintRequestContext,
  enRoute: EnRouteContext,
): Promise<void> {
  const tail = await loadEnRouteTail(enRoute.groupId, enRoute.fromBlockId);

  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, ctx.eventId),
    columns: { route_id: true },
  });
  const templateVars = event ? await buildRouteTemplateVars(event.route_id) : {};

  const bankLine = await getRandomMessageBank(EN_ROUTE_HELP_BANK_TYPE, ctx.language);

  if (!tail.directions && !tail.mapLink) {
    const content =
      bankLine ??
      (EN_ROUTE_NO_DIRECTIONS_FALLBACK[ctx.language] ?? EN_ROUTE_NO_DIRECTIONS_FALLBACK.en);
    await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, content, null, undefined, SCRIPTED_MESSAGE);
    return;
  }

  const leadIn = bankLine ?? (EN_ROUTE_HELP_FALLBACK[ctx.language] ?? EN_ROUTE_HELP_FALLBACK.en);
  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, leadIn, null, undefined, SCRIPTED_MESSAGE);

  if (tail.directions) {
    await writeGuideMessage(
      ctx.eventId,
      ctx.eventCode,
      ctx.currentStop,
      applyTemplateVars(tail.directions, templateVars),
      null,
      "message",
      SCRIPTED_MESSAGE,
    );
  }

  if (tail.mapLink) {
    await writeGuideMessage(
      ctx.eventId,
      ctx.eventCode,
      ctx.currentStop,
      tail.mapLink,
      null,
      "map",
      SCRIPTED_MESSAGE,
    );
  }

  log.info("served en-route directions instead of a hint", {
    eventCode: ctx.eventCode,
    groupId: enRoute.groupId,
  });
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
  let exhaustedMsg = await getRandomMessageBank("hint-exhausted", ctx.language);
  exhaustedMsg = exhaustedMsg ?? (HINT_EXHAUSTED_FALLBACK[ctx.language] ?? HINT_EXHAUSTED_FALLBACK.en).replace("{{ANSWER}}", answer);
  exhaustedMsg = exhaustedMsg.replace("{{ANSWER}}", answer);
  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, exhaustedMsg, null, undefined, SCRIPTED_MESSAGE);

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
