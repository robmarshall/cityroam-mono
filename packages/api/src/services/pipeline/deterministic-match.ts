/**
 * Deterministic (no-LLM) answer matching fallback.
 * Used when DeepSeek is unreachable so players can still progress.
 */

import type { SupportedLanguage } from "@cityroam/shared/types";

/** Leading articles per language, matched case-insensitively. */
const LEADING_ARTICLES: Record<string, readonly string[]> = {
  en: ["the", "a", "an"],
  es: ["el", "la", "los", "las", "un", "una", "unos", "unas"],
  fr: ["le", "la", "les", "l'", "un", "une", "des"],
  de: ["der", "die", "das", "ein", "eine"],
  nl: ["de", "het", "een"],
};

function buildArticleRegex(language: SupportedLanguage): RegExp {
  const articles = [
    ...(LEADING_ARTICLES[language] ?? []),
    // Always include English articles as fallback (accepted_answers may be English)
    ...(language !== "en" ? LEADING_ARTICLES.en! : []),
  ];
  if (articles.length === 0) return /(?!)/; // never matches
  // Handle French l' (elision) separately — no trailing space required
  const escaped = articles.map((a) =>
    a.endsWith("'") ? a : a + "\\s+",
  );
  return new RegExp(`^(?:${escaped.join("|")})`, "i");
}

/**
 * Unicode-normalize a string: NFD decompose then strip combining marks,
 * so accented characters match their base forms (café → cafe).
 */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(s: string, language: SupportedLanguage): string {
  const articleRe = buildArticleRegex(language);
  return stripAccents(s.trim().toLowerCase()).replace(articleRe, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check whether the player's message matches any of the accepted answers
 * using simple string rules (case-insensitive, article-stripping,
 * Unicode normalization, word-boundary substring).
 */
export function deterministicAnswerMatch(
  userMessage: string,
  acceptedAnswers: string[],
  language: SupportedLanguage = "en",
): boolean {
  const msg = normalize(userMessage, language);
  if (msg.length === 0) return false;

  for (const answer of acceptedAnswers) {
    const ans = normalize(answer, language);
    if (ans.length === 0) continue;

    // Word-boundary match: accepted answer appears as a whole-word substring
    const pattern = new RegExp(`\\b${escapeRegex(ans)}\\b`, "i");
    if (pattern.test(msg)) return true;
  }

  return false;
}
