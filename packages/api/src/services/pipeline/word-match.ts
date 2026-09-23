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

/**
 * Per-language ways of asking for a hint or admitting defeat. Deliberately
 * short and unambiguous — this only has to catch the obvious phrasings a
 * stuck group reaches for when the LLM classifier is unavailable.
 */
const HINT_REQUEST_WORDS: Record<SupportedLanguage, readonly string[]> = {
  en: ["hint", "clue", "stuck", "help", "give up", "no idea", "tell us", "tell me", "the answer"],
  es: ["pista", "ayuda", "atascado", "atascados", "no sabemos", "ni idea", "rendirse", "la respuesta"],
  fr: ["indice", "aide", "bloque", "bloques", "aucune idee", "abandonner", "la reponse"],
  de: ["hinweis", "hilfe", "stecken fest", "keine ahnung", "aufgeben", "die antwort"],
  nl: ["hint", "aanwijzing", "hulp", "vast", "geen idee", "opgeven", "het antwoord"],
};

/**
 * Per-language ways of asking to move on. Kept separate from the hint words
 * because the wording is different even though, without a classifier, both
 * land on the same scripted escape: hints are served until they run out, at
 * which point the answer is revealed and the block is left behind.
 */
const SKIP_REQUEST_WORDS: Record<SupportedLanguage, readonly string[]> = {
  en: ["skip", "skip this", "next", "next one", "next clue", "next stop", "move on", "pass"],
  es: ["saltar", "saltamos", "siguiente", "pasar", "pasamos"],
  fr: ["passer", "on passe", "suivant", "suivante"],
  de: ["überspringen", "weiter", "nächste", "nächster", "nächstes"],
  nl: ["overslaan", "volgende", "verder"],
};

// Legacy exports for backwards compatibility with imports
export const AFFIRMATIVE_WORDS = WORD_LISTS.en.affirmative;
export const NEGATIVE_WORDS = WORD_LISTS.en.negative;

/** Combining marks left behind by NFD decomposition. */
const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase, strip accents and punctuation, collapse whitespace. */
function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether the text contains any of the phrases as whole words, so "help"
 * doesn't fire on "helpful" and "vast" doesn't fire on "vastgoed".
 */
export function containsPhraseFromList(
  text: string,
  phrases: readonly string[],
): boolean {
  const haystack = normalise(text);
  if (!haystack) return false;

  return phrases.some((phrase) => {
    const needle = normalise(phrase);
    if (!needle) return false;
    return new RegExp(`(?:^|\\s)${needle}(?:\\s|$)`, "u").test(haystack);
  });
}

/**
 * Check if the player is asking for a hint, without the LLM classifier.
 * Used when an event has spent its guide response budget — hints are fully
 * scripted, so they have to stay reachable or a stuck group has no way on.
 */
export function isHintRequest(text: string, language: SupportedLanguage = "en"): boolean {
  if (containsPhraseFromList(text, HINT_REQUEST_WORDS[language])) return true;
  // Players often fall back to English regardless of the game language
  if (language !== "en" && containsPhraseFromList(text, HINT_REQUEST_WORDS.en)) return true;
  return false;
}

/**
 * Check if the player is asking to move on, without the LLM classifier.
 * Same purpose as isHintRequest: a stuck group must keep a scripted route out
 * of a block when the classifier is unavailable or the guide budget is spent.
 */
export function isSkipRequest(text: string, language: SupportedLanguage = "en"): boolean {
  if (containsPhraseFromList(text, SKIP_REQUEST_WORDS[language])) return true;
  // Players often fall back to English regardless of the game language
  if (language !== "en" && containsPhraseFromList(text, SKIP_REQUEST_WORDS.en)) return true;
  return false;
}

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
