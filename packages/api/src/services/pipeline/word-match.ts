/**
 * Generic word-list matcher for pre-LLM deterministic checks.
 * Same "cheap check before LLM" pattern as deterministicAnswerMatch,
 * but generalised for any word list.
 */

import type { SupportedLanguage } from "@cityroam/shared/types";

/** Per-language affirmative and negative word lists. */
const WORD_LISTS: Record<SupportedLanguage, { affirmative: readonly string[]; negative: readonly string[] }> = {
  en: {
    affirmative: ["yes", "yeah", "yep", "yea", "sure", "ok", "okay", "please", "go ahead", "definitely", "absolutely", "y"],
    negative: ["no", "nah", "nope", "no thanks", "not yet", "im good", "i'm good", "n"],
  },
  es: {
    affirmative: ["sí", "si", "vale", "claro", "por favor", "ok", "okay", "dale", "venga", "s"],
    negative: ["no", "nah", "no gracias", "todavía no", "estoy bien", "n"],
  },
  fr: {
    affirmative: ["oui", "ouais", "bien sûr", "d'accord", "ok", "okay", "s'il vous plaît", "svp", "o"],
    negative: ["non", "nah", "non merci", "pas encore", "ça va", "n"],
  },
  de: {
    affirmative: ["ja", "jo", "klar", "sicher", "ok", "okay", "bitte", "gerne", "j"],
    negative: ["nein", "nö", "nee", "nein danke", "noch nicht", "n"],
  },
  nl: {
    affirmative: ["ja", "joh", "zeker", "oké", "ok", "okay", "alsjeblieft", "graag", "j"],
    negative: ["nee", "nah", "nee bedankt", "nog niet", "n"],
  },
};

// Legacy exports for backwards compatibility with imports
export const AFFIRMATIVE_WORDS = WORD_LISTS.en.affirmative;
export const NEGATIVE_WORDS = WORD_LISTS.en.negative;

/**
 * Normalise input (lowercase, trim, strip trailing punctuation, strip accents)
 * and check against a word list.
 */
export function matchesWordList(text: string, words: readonly string[]): boolean {
  const normalised = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.!?,]+$/, "");
  // Check against both the accented and unaccented forms
  return words.some(
    (w) => normalised === w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  );
}

/**
 * Check if text is an affirmative response in the given language.
 * Falls back to English if no match found in the target language.
 */
export function isAffirmativeResponse(text: string, language: SupportedLanguage = "en"): boolean {
  const list = WORD_LISTS[language];
  if (matchesWordList(text, list.affirmative)) return true;
  // Fallback to English (players may respond in English regardless of game language)
  if (language !== "en" && matchesWordList(text, WORD_LISTS.en.affirmative)) return true;
  return false;
}

/**
 * Check if text is a negative response in the given language.
 * Falls back to English if no match found in the target language.
 */
export function isNegativeResponse(text: string, language: SupportedLanguage = "en"): boolean {
  const list = WORD_LISTS[language];
  if (matchesWordList(text, list.negative)) return true;
  // Fallback to English
  if (language !== "en" && matchesWordList(text, WORD_LISTS.en.negative)) return true;
  return false;
}
