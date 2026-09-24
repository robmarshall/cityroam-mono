/**
 * Is the player asking what the guide is? Framework-free (its only import is
 * the shared answer normaliser), so the API pipeline and the marketing site's demo can
 * share it (also exported as `@cityroam/shared/identity-question`).
 *
 * Four kinds, because the honest reply differs:
 *
 * - `"ai"`: asked directly about AI (are you AI? is this ChatGPT? artificial
 *   intelligence?). Owner decision (2026-09-24): answered honestly, and these
 *   are the only replies on the marketing site allowed to say "AI".
 * - `"machine"`: are you a bot / robot / a computer / automated? A reply must
 *   never deny it. The marketing demo sidesteps without a "no".
 * - `"person"`: are you a real person / human / is someone typing? "Not a
 *   person, no" is true, so these replies may start with a no.
 * - `"who"`: who are you / what are you / what's your name?
 *
 * A message that asks two things gets the most direct kind: "are you a person
 * or an AI?" is `"ai"`, "are you a person or a bot?" is `"machine"`, so it
 * never gets a denial. Matching is on whole normalised phrases (accents,
 * case and punctuation ignored), and deliberately avoids single words like
 * "real" or "person", so questions about the clue ("is this the real
 * building?", "is it a person?", "who built this?") return null. Every
 * non-English language also checks the English phrases, because players fall
 * back to English.
 */

import type { SupportedLanguage } from "../types/index.js";
// Extensionless on purpose: the marketing site bundles this file straight
// from source (Turbopack does not map ".js" to ".ts" here); tsx, Vite and
// Vitest resolve it the same way.
import { containsPhraseFromList } from "./answer-match";

export type IdentityQuestionKind = "ai" | "machine" | "person" | "who";

type Patterns = Record<IdentityQuestionKind, readonly string[]>;

const IDENTITY_PATTERNS: Record<SupportedLanguage, Patterns> = {
  en: {
    ai: ["ai", "a i", "an ai", "artificial intelligence", "chatgpt", "chat gpt", "gpt", "llm", "openai", "deepseek"],
    machine: [
      "bot", "robot", "chatbot", "chat bot", "computer", "automated", "are you automatic",
      "are you a machine", "a program", "software", "algorithm",
    ],
    person: [
      "real person", "are you a person", "are you human", "are you a human", "human being", "real human",
      "are you real", "is this a person", "is someone typing", "is anyone typing", "someone typing",
      "person typing", "is anyone there", "is someone there", "are you alive",
    ],
    who: [
      "who are you", "who is this", "who s this", "whos this", "what are you", "your name",
      "who am i talking to", "who am i speaking to",
    ],
  },
  es: {
    ai: ["ia", "una ia", "inteligencia artificial", "chatgpt", "gpt"],
    machine: [
      "bot", "robot", "chatbot", "ordenador",
      "computadora", "eres una maquina", "automatico", "automatica", "un programa",
    ],
    person: [
      "persona real", "persona de verdad", "eres una persona", "eres humano", "eres humana", "ser humano",
      "eres real", "hay alguien escribiendo", "alguien escribiendo", "escribe una persona", "hay alguien ahi",
    ],
    who: ["quien eres", "que eres", "como te llamas", "tu nombre", "con quien hablo"],
  },
  fr: {
    ai: ["ia", "une ia", "intelligence artificielle", "chatgpt", "gpt"],
    machine: [
      "bot", "robot", "chatbot", "ordinateur",
      "es tu une machine", "tu es une machine", "automatique", "automatise", "un programme", "logiciel",
    ],
    person: [
      "vraie personne", "es tu humain", "tu es humain", "t es humain", "etre humain", "es tu reel",
      "tu es reel", "t es reel", "quelqu un ecrit", "quelqu un tape", "il y a quelqu un",
    ],
    who: ["qui es tu", "qui etes vous", "t es qui", "qu es tu", "ton nom", "comment tu t appelles", "a qui je parle"],
  },
  de: {
    ai: ["ki", "eine ki", "ai", "kunstliche intelligenz", "chatgpt", "gpt"],
    machine: [
      "bot", "roboter", "chatbot", "computer",
      "maschine", "automatisch", "ein programm", "software",
    ],
    person: [
      "echter mensch", "bist du ein mensch", "bist du echt", "echte person", "tippt da jemand",
      "schreibt da jemand", "schreibt da ein mensch", "ist da jemand",
    ],
    who: ["wer bist du", "was bist du", "wie heisst du", "wie heißt du", "dein name", "mit wem spreche ich", "mit wem rede ich"],
  },
  nl: {
    ai: ["ai", "een ai", "ki", "kunstmatige intelligentie", "chatgpt", "gpt"],
    machine: [
      "bot", "robot", "chatbot", "computer",
      "machine", "automatisch", "een programma", "software",
    ],
    person: [
      "echt persoon", "echte persoon", "ben je een mens", "ben jij een mens", "echt mens", "ben je echt",
      "ben jij echt", "typt er iemand", "zit er iemand", "typt er een mens", "is er iemand",
    ],
    who: ["wie ben jij", "wie ben je", "wat ben je", "wat ben jij", "hoe heet je", "je naam", "met wie praat ik"],
  },
};

/**
 * English phrases that are ordinary words in another language once accents
 * and apostrophes are gone: French "j'ai" normalises to "j ai".
 */
const ENGLISH_FALLBACK_EXCLUDE: Partial<Record<SupportedLanguage, readonly string[]>> = {
  fr: ["ai", "a i"],
};

/** Checked in this order: a message that asks two things gets the safest reply. */
const ORDER: readonly IdentityQuestionKind[] = ["ai", "machine", "person", "who"];

function patternsFor(language: SupportedLanguage): Patterns[] {
  const own = IDENTITY_PATTERNS[language] ?? IDENTITY_PATTERNS.en;
  if (language === "en") return [own];
  const exclude = ENGLISH_FALLBACK_EXCLUDE[language] ?? [];
  const en = IDENTITY_PATTERNS.en;
  return [
    own,
    {
      ai: en.ai.filter((p) => !exclude.includes(p)),
      machine: en.machine.filter((p) => !exclude.includes(p)),
      person: en.person.filter((p) => !exclude.includes(p)),
      who: en.who.filter((p) => !exclude.includes(p)),
    },
  ];
}

/**
 * Whether a reply opens with a no, in any supported language. Replies to the
 * `machine` and `who` kinds must never do so (and `ai` replies don't): a
 * leading "no" to "are you a bot?" reads as a false denial of being
 * automated. Only `person` replies may, since "not a person, no" is true.
 */
export function opensWithNegation(reply: string): boolean {
  return /^[\s"'“‘«„¿¡(]*(no|not|nope|nah|never|ni|nunca|non|pas|jamais|nein|nicht|kein|keine|nie|nee|niet|geen|nooit)(?![\p{L}\p{N}])/iu.test(
    reply,
  );
}

/** What kind of "what are you?" question the message is, or null if it isn't one. */
export function classifyIdentityQuestion(
  text: string,
  language: SupportedLanguage = "en",
): IdentityQuestionKind | null {
  const lists = patternsFor(language);
  for (const kind of ORDER) {
    if (lists.some((patterns) => containsPhraseFromList(text, patterns[kind]))) return kind;
  }
  return null;
}
