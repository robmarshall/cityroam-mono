/**
 * Degraded mode: how the guide behaves while the LLM classifier is
 * unavailable.
 *
 * Both routes out of a question block are fully scripted — the deterministic
 * answer matcher accepts a correct answer, and the hint path serves the next
 * hint or, once hints run out, reveals the answer and advances. Neither needs
 * the LLM. Keeping both reachable without a classifier is what stops a
 * provider outage from dead-ending every hunt in progress.
 *
 * Anything the keyword matchers don't recognise gets a message that says the
 * guide is struggling and names the two things that still work, instead of a
 * bare clarification line that leaves the player guessing.
 */

import type { SupportedLanguage } from "@cityroam/shared/types";
import { deterministicAnswerMatch } from "./deterministic-match.js";
import { isHintRequest, isSkipRequest } from "./word-match.js";
import {
  writeGuideMessage,
  getRandomMessageBank,
  SCRIPTED_MESSAGE,
} from "./handlers/answer-attempt.js";

/**
 * Intents the degraded classifier can produce. The first two are real
 * pipeline intents; `degraded-notice` is the catch-all that replaces
 * `clarification` while the LLM is down.
 */
export type DegradedIntent = "answer-attempt" | "hint-request" | "degraded-notice";

/** Message bank type for the "I'm struggling" notice. */
export const DEGRADED_BANK_TYPE = "guide-degraded";
/** Message bank type for the "too many at once" notice. */
export const BUSY_BANK_TYPE = "guide-busy";

/**
 * Used when the bank has no entry for the language. The bank types above are
 * optional on purpose: seeding them upgrades the wording, and until then the
 * player still gets a usable message.
 */
const DEGRADED_FALLBACK: Record<SupportedLanguage, string> = {
  en: "I'm having trouble thinking straight right now. You can still type your answer, or ask for a hint.",
  es: "Ahora mismo me cuesta pensar con claridad. Puedes escribir tu respuesta o pedir una pista.",
  fr: "J'ai du mal à réfléchir en ce moment. Vous pouvez toujours écrire votre réponse ou demander un indice.",
  de: "Ich kann gerade nicht klar denken. Du kannst trotzdem deine Antwort eingeben oder nach einem Hinweis fragen.",
  nl: "Ik kan nu even niet helder nadenken. Je kunt nog steeds je antwoord typen of om een hint vragen.",
};

const BUSY_FALLBACK: Record<SupportedLanguage, string> = {
  en: "One at a time — give me a moment, then ask again.",
  es: "De uno en uno — dame un momento y vuelve a preguntar.",
  fr: "Un à la fois — laissez-moi un instant, puis redemandez.",
  de: "Einer nach dem anderen — gib mir einen Moment und frag noch mal.",
  nl: "Een tegelijk — geef me even, vraag het dan opnieuw.",
};

/**
 * Classify a message without the LLM.
 *
 * Order matters. Answers win over hint keywords so "stuck on this — is it the
 * Town Hall?" is accepted as the answer it is rather than spending a hint.
 * Skip-style wording is routed to the hint path because that is the only
 * scripted route that force-advances: repeated asks exhaust the hints, the
 * answer is revealed and the block is left behind.
 */
export function classifyWithoutLLM(
  text: string,
  acceptedAnswers: string[],
  language: SupportedLanguage,
): DegradedIntent {
  if (
    acceptedAnswers.length > 0 &&
    deterministicAnswerMatch(text, acceptedAnswers, language)
  ) {
    return "answer-attempt";
  }

  if (isHintRequest(text, language) || isSkipRequest(text, language)) {
    return "hint-request";
  }

  return "degraded-notice";
}

/**
 * Tell the player the guide is struggling and that answers and hints still
 * work. Bank text, so it costs no LLM call and no guide-response budget.
 */
export async function sendDegradedNotice(
  eventId: string,
  eventCode: string,
  currentStop: number,
  language: SupportedLanguage,
): Promise<void> {
  const bank = await getRandomMessageBank(DEGRADED_BANK_TYPE, language);
  const content = bank ?? (DEGRADED_FALLBACK[language] ?? DEGRADED_FALLBACK.en);
  await writeGuideMessage(
    eventId,
    eventCode,
    currentStop,
    content,
    null,
    undefined,
    SCRIPTED_MESSAGE,
  );
}

/**
 * Tell the player their conversational message was crowded out by a
 * teammate's. Sent instead of silence when the shared guide rate limit blocks
 * a reply, and itself limited on a coarser window so a chatty group doesn't
 * fill the channel with hold-on lines.
 */
export async function sendGuideBusyNotice(
  eventId: string,
  eventCode: string,
  currentStop: number,
  language: SupportedLanguage,
): Promise<void> {
  const bank = await getRandomMessageBank(BUSY_BANK_TYPE, language);
  const content = bank ?? (BUSY_FALLBACK[language] ?? BUSY_FALLBACK.en);
  await writeGuideMessage(
    eventId,
    eventCode,
    currentStop,
    content,
    null,
    undefined,
    SCRIPTED_MESSAGE,
  );
}
