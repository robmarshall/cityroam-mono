/**
 * Generic word-list matcher for pre-LLM deterministic checks.
 * Same "cheap check before LLM" pattern as deterministicAnswerMatch,
 * but generalised for any word list.
 */

export const AFFIRMATIVE_WORDS = [
  "yes",
  "yeah",
  "yep",
  "yea",
  "sure",
  "ok",
  "okay",
  "please",
  "go ahead",
  "definitely",
  "absolutely",
  "y",
];

export const NEGATIVE_WORDS = [
  "no",
  "nah",
  "nope",
  "no thanks",
  "not yet",
  "im good",
  "i'm good",
  "n",
];

/**
 * Normalise input (lowercase, trim, strip trailing punctuation)
 * and check against a word list.
 */
export function matchesWordList(text: string, words: readonly string[]): boolean {
  const normalised = text.toLowerCase().trim().replace(/[.!?,]+$/, "");
  return words.includes(normalised);
}

export function isAffirmativeResponse(text: string): boolean {
  return matchesWordList(text, AFFIRMATIVE_WORDS);
}

export function isNegativeResponse(text: string): boolean {
  return matchesWordList(text, NEGATIVE_WORDS);
}
