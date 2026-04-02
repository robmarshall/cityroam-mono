import {
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
} from "@cityroam/shared/constants";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { checkParticipantRateLimit } from "../../redis/rate-limit.js";
import { getRandomMessageBank } from "./handlers/answer-attempt.js";

const OVER_LENGTH_FALLBACK: Record<SupportedLanguage, string> = {
  en: "Your message is too long. Please keep it shorter.",
  es: "Tu mensaje es demasiado largo. Por favor, hazlo más corto.",
  fr: "Votre message est trop long. Veuillez le raccourcir.",
  de: "Deine Nachricht ist zu lang. Bitte kürze sie.",
  nl: "Je bericht is te lang. Houd het alsjeblieft korter.",
};

export interface PreFilterResult {
  action: "pass" | "drop" | "respond";
  response?: string;
}

/**
 * Layer 1: Programmatic pre-filter (no LLM).
 * Fast code-only checks before message enters the AI pipeline.
 */
export async function preFilter(
  text: string,
  eventCode: string,
  participantId: string,
  language: SupportedLanguage = "en",
): Promise<PreFilterResult> {
  const trimmed = text.trim();

  // 1. Empty / whitespace-only → silently drop (not stored)
  if (trimmed.length === 0) {
    return { action: "drop" };
  }

  // 2. Under MIN_MESSAGE_LENGTH → silently drop (not stored)
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return { action: "drop" };
  }

  // 3. Over MAX_MESSAGE_LENGTH → drop message, respond with over-length bank message
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    const response = await getRandomMessageBank("over-length", language);
    return { action: "respond", response: response ?? (OVER_LENGTH_FALLBACK[language] ?? OVER_LENGTH_FALLBACK.en) };
  }

  // 4. Participant rate limit → silently drop (not stored)
  const rateLimit = await checkParticipantRateLimit(eventCode, participantId);
  if (!rateLimit.allowed) {
    return { action: "drop" };
  }

  return { action: "pass" };
}
