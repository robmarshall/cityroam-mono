import { eq } from "drizzle-orm";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { db, schema } from "../../../db/index.js";
import { writeGuideMessage, getRandomMessageBank, SCRIPTED_MESSAGE } from "./answer-attempt.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("hint-nudge");

export interface HintNudgeContext {
  eventId: string;
  eventCode: string;
  currentStop: number;
  language: SupportedLanguage;
}

/**
 * Handle a hint-nudge message.
 *
 * The player expressed frustration or being stuck without explicitly asking
 * for a hint. Send a "hint-offer" message bank prompt (e.g. "Do you need a hint?")
 * and set hint_offered = true so the next message can be checked for confirmation.
 */
const HINT_OFFER_FALLBACK: Record<SupportedLanguage, string> = {
  en: "Would you like a hint?",
  es: "¿Te gustaría una pista?",
  fr: "Voulez-vous un indice ?",
  de: "Möchtest du einen Hinweis?",
  nl: "Wil je een hint?",
};

export async function handleHintNudge(ctx: HintNudgeContext): Promise<void> {
  const offerMsg = await getRandomMessageBank("hint-offer", ctx.language);
  const content = offerMsg ?? (HINT_OFFER_FALLBACK[ctx.language] ?? HINT_OFFER_FALLBACK.en);

  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, content, null, undefined, SCRIPTED_MESSAGE);

  await db
    .update(schema.events)
    .set({ hint_offered: true })
    .where(eq(schema.events.id, ctx.eventId));

  log.info("hint offered", { eventCode: ctx.eventCode });
}
