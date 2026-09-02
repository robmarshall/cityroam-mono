/**
 * Deterministic (no-LLM) answer matching.
 *
 * Two jobs:
 *
 * - `deterministicAnswerMatch` is the fallback used when DeepSeek is
 *   unreachable or the event has spent its guide budget, so players can still
 *   progress. It is also the cheap corroborating signal on the normal path.
 * - `nearAnswerMatch` is a looser, still purely lexical check used to
 *   corroborate an LLM "correct" verdict on answers the strict matcher misses
 *   (typos, abbreviations). See `matchAnswer` in handlers/answer-attempt.ts.
 *
 * Both work on tokens rather than raw substrings, which is what lets the
 * negation guard exist: "definitely not the town hall" used to score correct,
 * handing a free advance to anyone who typed the wrong answer confidently.
 */

import type { SupportedLanguage } from "@cityroam/shared/types";

/** Leading articles per language, matched case-insensitively. */
const LEADING_ARTICLES: Record<string, readonly string[]> = {
  en: ["the", "a", "an"],
  es: ["el", "la", "los", "las", "un", "una", "unos", "unas"],
  fr: ["le", "la", "les", "l", "un", "une", "des"],
  de: ["der", "die", "das", "ein", "eine"],
  nl: ["de", "het", "een"],
};

/**
 * Negation words per language. A match preceded by one of these within
 * `NEGATION_WINDOW` tokens is not an answer — it is the player ruling that
 * answer out.
 *
 * English is always included: players fall back to it regardless of the game
 * language, exactly as the article and hint-word lists already assume.
 */
const NEGATION_WORDS: Record<string, readonly string[]> = {
  en: ["not", "no", "never", "cant", "cannot", "isnt", "arent", "wasnt", "aint", "nor", "neither"],
  es: ["no", "ni", "nunca", "tampoco", "jamas"],
  fr: ["pas", "ne", "non", "jamais", "aucun", "aucune", "ni"],
  de: ["nicht", "kein", "keine", "keinen", "nie", "niemals", "nein"],
  nl: ["niet", "geen", "nooit", "nee", "noch"],
};

/** How many tokens before a match are searched for a negation. */
const NEGATION_WINDOW = 3;

/**
 * Abbreviations expanded on both sides before fuzzy comparison, so "St Peters"
 * corroborates "Saint Peters" without the edit distance having to absorb it.
 */
const ABBREVIATIONS: Record<string, string> = {
  st: "saint",
  ste: "saint",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  sq: "square",
  mt: "mount",
  pk: "park",
  dr: "drive",
  ln: "lane",
  blvd: "boulevard",
  pl: "place",
  ct: "court",
  bldg: "building",
};

/**
 * Unicode-normalize a string: NFD decompose then strip combining marks,
 * so accented characters match their base forms (café → cafe).
 */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(new RegExp("[\u0300-\u036f]", "g"), "");
}

/**
 * Lowercase, strip accents, replace anything that is not a letter or digit
 * with a space, and split. Punctuation dropping is what makes "St. Paul's"
 * and "st pauls" the same two tokens.
 */
function tokenize(s: string): string[] {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function articlesFor(language: SupportedLanguage): ReadonlySet<string> {
  return new Set([
    ...(LEADING_ARTICLES[language] ?? []),
    // Accepted answers may be written in English whatever the game language
    ...(language !== "en" ? LEADING_ARTICLES.en! : []),
  ]);
}

function negationsFor(language: SupportedLanguage): ReadonlySet<string> {
  return new Set([
    ...(NEGATION_WORDS[language] ?? []),
    ...(language !== "en" ? NEGATION_WORDS.en! : []),
  ]);
}

/** Drop leading articles, matching the old regex behaviour on tokens. */
function stripLeadingArticles(tokens: string[], articles: ReadonlySet<string>): string[] {
  let i = 0;
  while (i < tokens.length - 1 && articles.has(tokens[i])) i++;
  return tokens.slice(i);
}

/**
 * Whether a negation sits close enough in front of `start` to mean the player
 * is ruling this answer out. English contractions ("isn't", "doesn't") survive
 * tokenization as "isn" + "t", so a bare "t" after a word ending in "n"
 * counts too.
 */
function isNegated(
  tokens: readonly string[],
  start: number,
  negations: ReadonlySet<string>,
): boolean {
  const from = Math.max(0, start - NEGATION_WINDOW);
  for (let i = from; i < start; i++) {
    const token = tokens[i];
    if (negations.has(token)) return true;
    // "isn t", "doesn t", "won t" — the apostrophe is gone by now
    if (token === "t" && i > 0 && /n$/.test(tokens[i - 1])) return true;
  }
  return false;
}

/**
 * Every start index at which `answer` appears as a consecutive token run in
 * `tokens`.
 */
function findRuns(tokens: readonly string[], answer: readonly string[]): number[] {
  const hits: number[] = [];
  if (answer.length === 0 || answer.length > tokens.length) return hits;

  outer: for (let i = 0; i + answer.length <= tokens.length; i++) {
    for (let j = 0; j < answer.length; j++) {
      if (tokens[i + j] !== answer[j]) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

/**
 * Check whether the player's message matches any of the accepted answers
 * using simple string rules (case-insensitive, article-stripping, punctuation
 * and Unicode normalization, whole-word runs), rejecting matches the player
 * negated.
 */
export function deterministicAnswerMatch(
  userMessage: string,
  acceptedAnswers: string[],
  language: SupportedLanguage = "en",
): boolean {
  const articles = articlesFor(language);
  const negations = negationsFor(language);

  const tokens = stripLeadingArticles(tokenize(userMessage), articles);
  if (tokens.length === 0) return false;

  for (const answer of acceptedAnswers) {
    const answerTokens = stripLeadingArticles(tokenize(answer), articles);
    if (answerTokens.length === 0) continue;

    for (const start of findRuns(tokens, answerTokens)) {
      if (!isNegated(tokens, start, negations)) return true;
    }
  }

  return false;
}

/** Levenshtein distance, iterative with a single row. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * How many single-character edits an answer of this length may absorb. Two is
 * the tolerance the answer-matching prompt promises players ("1-2 character
 * transpositions or omissions"); longer names get a little more.
 */
function tolerance(length: number): number {
  if (length <= 4) return 1;
  if (length <= 12) return 2;
  return Math.floor(length * 0.2);
}

function expandAbbreviations(tokens: readonly string[]): string[] {
  return tokens.map((t) => ABBREVIATIONS[t] ?? t);
}

/**
 * Looser lexical check: does the message contain a token run that is within a
 * couple of typos of an accepted answer?
 *
 * This is the corroborating signal for an LLM "correct" verdict that the
 * strict matcher rejects — the typo and abbreviation cases the matching prompt
 * promises. It is deliberately lexical: it can confirm "Twon Hall", it cannot
 * confirm a message that merely argues it should be accepted.
 */
export function nearAnswerMatch(
  userMessage: string,
  acceptedAnswers: string[],
  language: SupportedLanguage = "en",
): boolean {
  const articles = articlesFor(language);
  const negations = negationsFor(language);

  const rawTokens = stripLeadingArticles(tokenize(userMessage), articles);
  if (rawTokens.length === 0) return false;
  const tokens = expandAbbreviations(rawTokens);

  for (const answer of acceptedAnswers) {
    const answerTokens = expandAbbreviations(
      stripLeadingArticles(tokenize(answer), articles),
    );
    if (answerTokens.length === 0) continue;

    const target = answerTokens.join(" ");
    const allowed = tolerance(target.length);
    const n = answerTokens.length;

    // A typo can merge or split a word, so windows one token either side of
    // the answer's own length are compared too.
    for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
      for (let start = 0; start + size <= tokens.length; start++) {
        const window = tokens.slice(start, start + size).join(" ");
        if (Math.abs(window.length - target.length) > allowed) continue;
        if (editDistance(window, target) > allowed) continue;
        if (isNegated(tokens, start, negations)) continue;
        return true;
      }
    }
  }

  return false;
}
