/**
 * Identity questions: "are you a bot?", "is this AI?", "who are you?".
 *
 * Owner decision (2026-09-24): these get canned message-bank replies instead
 * of an LLM answer, in the game as on the marketing demo. The replies have
 * rules an LLM can't be trusted to keep every time:
 *
 * - `ai` (asked directly about AI) gets an honest partial answer: AI helps
 *   word the replies, people choose and check the route and the clues.
 * - `machine` (bot / robot / computer / automated) and `who` never start with
 *   a negation, so nothing reads as a denial of being automated (EU AI Act).
 * - `person` may start with "Not a person, no", because that is true.
 *
 * The check runs after the code-only pre-filter and before LLM intent
 * classification, and it is deliberately conservative: a missed identity
 * question still reaches the question handler, whose prompt carries the same
 * rules, while a false positive would swallow an answer attempt. So a message
 * is routed only when it
 *
 * 1. is short (at most MAX_WORDS words),
 * 2. reads as a question (has a "?" or is at most BARE_QUESTION_WORDS words),
 * 3. is addressed to the guide ("are you…", "bist du…", "who am I talking
 *    to"), not about the clue ("is it the robot statue?", "is this the real
 *    one?", "who built this?"), and isn't an everyday question that merely
 *    contains an identity word ("are you sure it's the computer shop?"),
 * 4. is classified by the shared `classifyIdentityQuestion`, and
 * 5. does not match the current clue's accepted answers.
 */

import type { SupportedLanguage } from "@cityroam/shared/types";
import { guideNameFor } from "@cityroam/shared/constants";
import {
  classifyIdentityQuestion,
  containsPhraseFromList,
  normaliseText,
  type IdentityQuestionKind,
} from "@cityroam/shared/utils";
import { applyTemplateVars } from "../template-vars.js";
import { deterministicAnswerMatch } from "./deterministic-match.js";
import {
  getRandomMessageBank,
  writeGuideMessage,
  SCRIPTED_MESSAGE,
} from "./handlers/answer-attempt.js";

export type { IdentityQuestionKind };

/** Longest message, in words, that is still checked. */
const MAX_WORDS = 12;
/** A message this short counts as a question even without a "?". */
const BARE_QUESTION_WORDS = 6;

/** Message bank type for each kind of identity question. */
export const IDENTITY_BANK_TYPES: Record<IdentityQuestionKind, string> = {
  ai: "guide-identity-ai",
  machine: "guide-identity-machine",
  person: "guide-identity-person",
  who: "guide-identity-who",
};

/**
 * Phrases that address the guide. Matched as whole normalised phrases, like
 * the identity patterns themselves. Every non-English language also checks
 * the English list, as `classifyIdentityQuestion` does.
 */
const ADDRESS_PHRASES: Record<SupportedLanguage, readonly string[]> = {
  en: [
    "are you", "are u", "r u", "r you", "you re", "youre", "u r", "you a", "you an",
    "your name", "who are you", "what are you", "who is this", "who s this", "whos this",
    "am i talking", "am i speaking", "am i chatting", "someone typing", "anyone typing",
    "person typing", "anyone there", "someone there",
  ],
  es: [
    "eres", "tu nombre", "te llamas", "con quien hablo", "estoy hablando con", "es usted",
    "hay alguien", "alguien escribiendo", "escribe una persona",
  ],
  fr: [
    "es tu", "tu es", "t es", "etes vous", "vous etes", "ton nom", "t appelles",
    "a qui je parle", "quelqu un ecrit", "quelqu un tape", "il y a quelqu un",
  ],
  de: [
    "bist du", "du bist", "sind sie", "dein name", "heisst du", "heißt du", "mit wem",
    "tippt da jemand", "schreibt da", "ist da jemand",
  ],
  nl: [
    "ben je", "ben jij", "je bent", "jij bent", "bent u", "je naam", "heet je", "met wie",
    "typt er", "zit er iemand", "is er iemand",
  ],
};

/**
 * Extra address forms accepted for the `ai` kind only. "is this AI?" is about
 * the guide; "is this a robot?" might be about a statue, so `machine` and
 * `person` never get these.
 */
const AI_ONLY_ADDRESS_PHRASES: Record<SupportedLanguage, readonly string[]> = {
  en: ["is this"],
  es: ["es esto", "esto es"],
  fr: ["c est", "est ce"],
  de: ["ist das"],
  nl: ["is dit", "is dat"],
};

/**
 * Everyday questions that happen to contain an identity phrase: "what are
 * you doing?" is not "what are you?", and "are you sure it's the robot?" is
 * a guess about the clue.
 */
const NOT_IDENTITY_PHRASES: Record<SupportedLanguage, readonly string[]> = {
  en: [
    "what are you doing", "what are you talking about", "what are you on about",
    "what are you saying", "what are you thinking", "what are you looking",
    "what are you asking", "what are you up to",
    "are you sure", "you sure", "are you certain", "are you thinking", "are you saying",
    "are you talking", "are you looking", "are you after", "are you hinting",
    "are you referring", "are you pointing", "are you asking", "are you telling",
    "do you mean", "you mean",
  ],
  es: ["estas seguro", "estas segura", "seguro que", "te refieres", "quieres decir", "que estas haciendo"],
  fr: ["tu es sur", "t es sur", "es tu sur", "vous etes sur", "tu veux dire", "tu parles de", "tu penses"],
  de: ["bist du sicher", "sind sie sicher", "meinst du", "was machst du"],
  nl: [
    "wat ben je aan het", "wat ben jij aan het", "wat ben je van plan", "wat ben jij van plan",
    "weet je het zeker", "ben je zeker", "ben je er zeker", "bedoel je",
  ],
};

function listsFor<T>(table: Record<SupportedLanguage, readonly T[]>, language: SupportedLanguage): T[] {
  return language === "en" ? [...table.en] : [...(table[language] ?? []), ...table.en];
}

/**
 * The kind of identity question the message is, or null when it should go
 * through normal classification. See the module comment for the gates.
 */
export function detectIdentityQuestion(
  text: string,
  language: SupportedLanguage,
  acceptedAnswers: readonly string[] = [],
): IdentityQuestionKind | null {
  const normalised = normaliseText(text);
  if (!normalised) return null;

  const words = normalised.split(" ").length;
  if (words > MAX_WORDS) return null;
  const asksSomething = /[?¿]/.test(text) || words <= BARE_QUESTION_WORDS;
  if (!asksSomething) return null;

  if (containsPhraseFromList(text, listsFor(NOT_IDENTITY_PHRASES, language))) return null;

  const kind = classifyIdentityQuestion(text, language);
  if (!kind) return null;

  const address = listsFor(ADDRESS_PHRASES, language);
  if (kind === "ai") address.push(...listsFor(AI_ONLY_ADDRESS_PHRASES, language));
  if (!containsPhraseFromList(text, address)) return null;

  // An answer always wins: if the clue's answer is "the robot", "are you
  // thinking of the robot?" is a guess, not a question about the guide.
  if (acceptedAnswers.length > 0 && deterministicAnswerMatch(text, acceptedAnswers, language)) {
    return null;
  }

  return kind;
}

/**
 * Used when the bank has no entry for the kind yet (a database seeded before
 * these types existed). Same rules as the seeded banks.
 */
const IDENTITY_FALLBACK: Record<IdentityQuestionKind, Record<SupportedLanguage, string>> = {
  ai: {
    en: "Partly. AI helps me word my replies, but the route and the clues are chosen and checked by people.",
    es: "En parte. La IA me ayuda a redactar las respuestas, pero la ruta y las pistas las eligen y revisan personas.",
    fr: "En partie. L'IA m'aide à formuler mes réponses, mais le parcours et les énigmes sont choisis et vérifiés par des humains.",
    de: "Zum Teil. KI hilft mir beim Formulieren der Antworten, aber Route und Rätsel wählen und prüfen Menschen.",
    nl: "Deels. AI helpt me mijn antwoorden te formuleren, maar de route en de raadsels worden door mensen gekozen en gecontroleerd.",
  },
  machine: {
    en: "I'm {{GUIDE_NAME}}, the guide in your phone. The clue is still waiting.",
    es: "Soy {{GUIDE_NAME}}, el guía que lleváis en el móvil. La pista sigue esperando.",
    fr: "Je suis {{GUIDE_NAME}}, le guide dans votre téléphone. L'énigme vous attend toujours.",
    de: "Ich bin {{GUIDE_NAME}}, eure Begleiterin im Handy. Das Rätsel wartet noch.",
    nl: "Ik ben {{GUIDE_NAME}}, de gids in je telefoon. Het raadsel wacht nog.",
  },
  person: {
    en: "Not a person, no. I'm {{GUIDE_NAME}}, the guide in your phone.",
    es: "Una persona no, no. Soy {{GUIDE_NAME}}, el guía que lleváis en el móvil.",
    fr: "Pas une personne, non. Je suis {{GUIDE_NAME}}, le guide dans votre téléphone.",
    de: "Kein Mensch, nein. Ich bin {{GUIDE_NAME}}, eure Begleiterin im Handy.",
    nl: "Geen mens, nee. Ik ben {{GUIDE_NAME}}, de gids in je telefoon.",
  },
  who: {
    en: "I'm {{GUIDE_NAME}}, your guide for today. I know these streets and I keep the clues coming.",
    es: "Soy {{GUIDE_NAME}}, vuestro guía de hoy. Me conozco estas calles y os voy dando las pistas.",
    fr: "Je suis {{GUIDE_NAME}}, votre guide du jour. Je connais ces rues et je vous donne les énigmes.",
    de: "Ich bin {{GUIDE_NAME}}, eure Begleiterin für heute. Ich kenne diese Straßen und liefere die Rätsel.",
    nl: "Ik ben {{GUIDE_NAME}}, jullie gids voor vandaag. Ik ken deze straten en geef jullie de raadsels.",
  },
};

/** The reply for a kind: a random active bank line, else the fallback. */
export async function identityReply(
  kind: IdentityQuestionKind,
  language: SupportedLanguage,
): Promise<string> {
  const bank = await getRandomMessageBank(IDENTITY_BANK_TYPES[kind], language);
  const content = bank ?? (IDENTITY_FALLBACK[kind][language] ?? IDENTITY_FALLBACK[kind].en);
  return applyTemplateVars(content, { GUIDE_NAME: guideNameFor(language).inSentence });
}

/**
 * Send the canned reply. Bank text, so it costs no LLM call and does not
 * count towards the guide response cap.
 */
export async function sendIdentityReply(
  eventId: string,
  eventCode: string,
  currentStop: number,
  kind: IdentityQuestionKind,
  language: SupportedLanguage,
): Promise<void> {
  const content = await identityReply(kind, language);
  await writeGuideMessage(eventId, eventCode, currentStop, content, null, undefined, SCRIPTED_MESSAGE);
}
