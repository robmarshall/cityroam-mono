import {
  containsPhraseFromList,
  deterministicAnswerMatch,
  nearAnswerMatch,
  normaliseText,
  tokenizeAnswer,
} from "@cityroam/shared/answer-match";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { classifyIdentityQuestion, type IdentityQuestionKind } from "@cityroam/shared/identity-question";
import { DEMO_SCRIPTS, QA_IDS, type DemoScript, type QaId } from "./script";

/**
 * The scripted "Try the Owl" demo as a pure state machine, so it can be
 * tested without React: the component renders `state.messages` and sends
 * `events` to analytics.
 *
 * intro + clue → (wrong guesses, hints, questions) → correct → done → reset.
 *
 * The Owl's lines are message keys under `demo.owl` (translated in
 * messages/<locale>.json); the visitor's lines are kept as typed.
 */

/** Every key under `demo.owl` the demo can send. */
export type OwlKey =
  | "intro"
  | "clue"
  | "wrongGuess"
  | "close"
  | "wrong.0"
  | "wrong.1"
  | "wrong.2"
  | "hints.0"
  | "hints.1"
  | "reveal"
  | "success"
  | "funFact"
  | "outro"
  | "fallback"
  | "done"
  | `identity.${IdentityQuestionKind}.${number}`
  | `qa.${QaId}`;

export type DemoMessage =
  | { id: number; from: "owl"; key: OwlKey }
  | { id: number; from: "you"; text: string };

export type DemoPhase = "playing" | "done";

export interface DemoState {
  phase: DemoPhase;
  messages: DemoMessage[];
  /** Hints given, including the reveal after the last one. */
  hintsUsed: number;
  wrongAnswers: number;
  /** Identity questions so far, per kind, to rotate the replies. */
  identityAsked: Record<IdentityQuestionKind, number>;
  started: boolean;
  nextId: number;
}

export type DemoEvent =
  | { type: "started" }
  | { type: "answered"; result: "correct" | "incorrect" }
  | { type: "hint"; hint: number; revealed: boolean }
  | { type: "completed"; hints: number; wrongAnswers: number };

/** What a visitor's message was taken to be. */
export type DemoIntent =
  | { kind: "identity"; identity: IdentityQuestionKind }
  | { kind: "correct" }
  | { kind: "wrongGuess" }
  | { kind: "hint" }
  | { kind: "qa"; id: QaId }
  | { kind: "close" }
  | { kind: "wrong" }
  | { kind: "fallback" };

/**
 * How many lines each kind of identity question has under
 * `demo.owl.identity`, rotated in order. Owner decision (2026-09-24):
 * - `ai` ("are you AI?"): honest, and the only marketing copy allowed to say
 *   AI (the exemption is in the no-AI tests).
 * - `machine` ("are you a bot?"): sidesteps, and never opens with a no.
 * - `person` ("are you a real person?"): "Not a person, no" is true.
 * - `who` ("who are you?").
 */
export const IDENTITY_REPLY_COUNTS: Record<IdentityQuestionKind, number> = {
  ai: 3,
  machine: 3,
  person: 2,
  who: 2,
};

/**
 * The only marketing messages allowed to mention AI: the demo's honest
 * answers to "are you AI?" (owner decision, 2026-09-24). The no-AI tests in
 * src/__tests__/smoke.test.ts and demo.test.ts exempt exactly these keys, in
 * every locale; an AI mention anywhere else still fails.
 */
export const AI_EXEMPT_MESSAGE_KEYS: readonly string[] = [
  "demo.owl.identity.ai.0",
  "demo.owl.identity.ai.1",
  "demo.owl.identity.ai.2",
];

/** Two scripted hints; the request after that reveals the answer, as a real game does. */
export const HINT_COUNT = 2;

/** Longest message a visitor can send. */
export const MAX_INPUT_LENGTH = 200;

/** A short message that isn't a question reads as a guess. */
const MAX_GUESS_WORDS = 4;

function scriptsFor(locale: SupportedLanguage): DemoScript[] {
  return locale === "en" ? [DEMO_SCRIPTS.en] : [DEMO_SCRIPTS[locale], DEMO_SCRIPTS.en];
}

/**
 * Work out what the visitor meant. Order matters: identity questions ("are
 * you a bot?") first, then the answer (so "is it Father Time?" is right, not
 * a question), then the offered wrong guess, a
 * hint request, the Q&A bank, half the answer, a short guess, and finally the
 * fallback for anything the demo can't answer.
 */
export function classify(text: string, locale: SupportedLanguage): DemoIntent {
  const scripts = scriptsFor(locale);
  const answers = scripts.flatMap((s) => s.answers);
  const any = (pick: (s: DemoScript) => string[]) =>
    scripts.some((s) => containsPhraseFromList(text, pick(s)));

  const identity = classifyIdentityQuestion(text, locale);
  if (identity) return { kind: "identity", identity };

  if (deterministicAnswerMatch(text, answers, locale) || nearAnswerMatch(text, answers, locale)) {
    return { kind: "correct" };
  }
  if (scripts.some((s) => deterministicAnswerMatch(text, s.wrongGuess, locale))) {
    return { kind: "wrongGuess" };
  }
  if (any((s) => s.hint)) return { kind: "hint" };
  for (const id of QA_IDS) {
    if (any((s) => s.qa[id])) return { kind: "qa", id };
  }
  if (any((s) => s.close)) return { kind: "close" };

  const tokens = tokenizeAnswer(text);
  if (tokens.length === 0) return { kind: "fallback" };
  const normalised = normaliseText(text);
  const opensWithQuestion = scripts.some((s) =>
    s.questionWords.some((w) => normalised === w || normalised.startsWith(`${w} `)),
  );
  if (tokens.length <= MAX_GUESS_WORDS && !opensWithQuestion) return { kind: "wrong" };
  return { kind: "fallback" };
}

export function initialDemoState(): DemoState {
  return {
    phase: "playing",
    messages: [
      { id: 0, from: "owl", key: "intro" },
      { id: 1, from: "owl", key: "clue" },
    ],
    hintsUsed: 0,
    wrongAnswers: 0,
    identityAsked: { ai: 0, machine: 0, person: 0, who: 0 },
    started: false,
    nextId: 2,
  };
}

/** The visitor sends `text`; returns the new state and what happened, for analytics. */
export function sendMessage(
  state: DemoState,
  rawText: string,
  locale: SupportedLanguage,
): { state: DemoState; events: DemoEvent[] } {
  const text = rawText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!text) return { state, events: [] };

  const events: DemoEvent[] = [];
  let nextId = state.nextId;
  const messages: DemoMessage[] = [...state.messages, { id: nextId++, from: "you", text }];
  const say = (...keys: OwlKey[]) => {
    for (const key of keys) messages.push({ id: nextId++, from: "owl", key });
  };

  if (!state.started) events.push({ type: "started" });

  // One clue on this page. After it, everything gets the same polite line.
  if (state.phase === "done") {
    say("done");
    return { state: { ...state, messages, nextId, started: true }, events };
  }

  let { hintsUsed, wrongAnswers, identityAsked } = state;
  let phase: DemoPhase = state.phase;
  const intent = classify(text, locale);

  switch (intent.kind) {
    case "identity": {
      const kind = intent.identity;
      say(`identity.${kind}.${identityAsked[kind] % IDENTITY_REPLY_COUNTS[kind]}`);
      identityAsked = { ...identityAsked, [kind]: identityAsked[kind] + 1 };
      break;
    }
    case "correct":
      events.push({ type: "answered", result: "correct" });
      say("success", "funFact", "outro");
      phase = "done";
      events.push({ type: "completed", hints: hintsUsed, wrongAnswers });
      break;
    case "wrongGuess":
    case "close":
    case "wrong": {
      events.push({ type: "answered", result: "incorrect" });
      if (intent.kind === "wrongGuess") say("wrongGuess");
      else if (intent.kind === "close") say("close");
      else if (wrongAnswers === 0) say("wrong.0");
      // "You might want to ask for a hint" only while no hint has been asked for.
      else if (wrongAnswers >= 2 && hintsUsed === 0) say("wrong.2");
      else say("wrong.1");
      wrongAnswers++;
      break;
    }
    case "hint": {
      const revealed = hintsUsed >= HINT_COUNT;
      say(revealed ? "reveal" : (`hints.${hintsUsed}` as OwlKey));
      hintsUsed = Math.min(hintsUsed + 1, HINT_COUNT + 1);
      events.push({ type: "hint", hint: hintsUsed, revealed });
      break;
    }
    case "qa":
      say(`qa.${intent.id}`);
      break;
    case "fallback":
      say("fallback");
      break;
  }

  return {
    state: { phase, messages, hintsUsed, wrongAnswers, identityAsked, started: true, nextId },
    events,
  };
}
