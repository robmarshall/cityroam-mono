import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { locales } from "@/i18n/config";
import {
  classify,
  AI_EXEMPT_MESSAGE_KEYS,
  HINT_COUNT,
  IDENTITY_REPLY_COUNTS,
  initialDemoState,
  sendMessage,
  type DemoEvent,
  type DemoState,
  type OwlKey,
} from "@/lib/demo/engine";
import { DEMO_SCRIPTS, QA_IDS } from "@/lib/demo/script";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (locale: string) =>
  JSON.parse(readFileSync(path.resolve(here, "../../messages", `${locale}.json`), "utf8")) as Record<string, any>;
const demoOf = (locale: string) => load(locale).demo as Record<string, any>;

const owlKeys = (state: DemoState) =>
  state.messages.flatMap((m) => (m.from === "owl" ? [m.key] : []));
const lastOwl = (state: DemoState): OwlKey | undefined => owlKeys(state).at(-1);

/** Play a list of messages from the start, collecting every event. */
function play(locale: SupportedLanguage, ...texts: string[]) {
  let state = initialDemoState();
  const events: DemoEvent[] = [];
  for (const text of texts) {
    const result = sendMessage(state, text, locale);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe("demo answer matching", () => {
  it("accepts the answer and its variants in English", () => {
    for (const text of ["Father Time", "father time", "Is it Father Time?", "old father time", "FATHER TIME.", "Chronos", "farther time"]) {
      expect(classify(text, "en"), text).toEqual({ kind: "correct" });
    }
  });

  it("accepts each locale's own answer, with or without accents, and the English one", () => {
    const cases: Record<SupportedLanguage, string[]> = {
      en: ["father time"],
      es: ["el Padre Tiempo", "padre tiempo", "Father Time"],
      fr: ["le Père Temps", "le pere temps", "PÈRE TEMPS", "father time"],
      de: ["Vater Zeit", "vater zeit", "Father Time"],
      nl: ["Vader Tijd", "vader tijd", "father time"],
    };
    for (const [locale, texts] of Object.entries(cases) as [SupportedLanguage, string[]][]) {
      for (const text of texts) expect(classify(text, locale), `${locale}: ${text}`).toEqual({ kind: "correct" });
    }
  });

  it("does not accept a negated answer or half of it", () => {
    expect(classify("definitely not father time", "en").kind).not.toBe("correct");
    expect(classify("time", "en")).toEqual({ kind: "close" });
    expect(classify("tiempo", "es")).toEqual({ kind: "close" });
    expect(classify("Zeit", "de")).toEqual({ kind: "close" });
  });

  it("recognises the offered wrong guess in every locale", () => {
    for (const locale of locales as SupportedLanguage[]) {
      expect(classify(demoOf(locale).chips.wrongGuess, locale), locale).toEqual({ kind: "wrongGuess" });
    }
    expect(classify("death", "en")).toEqual({ kind: "wrongGuess" });
    expect(classify("la faucheuse", "fr")).toEqual({ kind: "wrongGuess" });
  });

  it("reads a short non-question as a guess, and anything else as off the script", () => {
    expect(classify("big ben", "en")).toEqual({ kind: "wrong" });
    expect(classify("is it the mayor?", "en")).toEqual({ kind: "wrong" });
    expect(classify("what's the weather like", "en")).toEqual({ kind: "fallback" });
    expect(classify("tell me a story about the history of Yorkshire pudding", "en").kind).toBe("hint");
    expect(classify("which football team should we support in this city", "en")).toEqual({ kind: "fallback" });
  });
});

describe("demo Q&A matching", () => {
  it("routes each chip to the right intent in every locale", () => {
    for (const locale of locales as SupportedLanguage[]) {
      const chips = demoOf(locale).chips;
      expect(classify(chips.hint, locale), `${locale} hint`).toEqual({ kind: "hint" });
      expect(classify(chips.distance, locale), `${locale} distance`).toEqual({ kind: "qa", id: "distance" });
    }
  });

  it("answers the scripted questions in English", () => {
    const cases: [string, string][] = [
      ["How much further?", "distance"],
      ["is this the real route?", "route"],
      ["Can we stop for coffee?", "coffee"],
      ["how much does it cost", "price"],
      ["What's this building?", "building"],
      ["hello", "greeting"],
    ];
    for (const [text, id] of cases) expect(classify(text, "en"), text).toEqual({ kind: "qa", id });
  });

  it("answers the scripted questions in the other locales", () => {
    const cases: [SupportedLanguage, string, string][] = [
      ["es", "¿Podemos parar a tomar un café?", "coffee"],
      ["fr", "On peut faire une pause café ?", "coffee"],
      ["de", "Wie viel kostet das?", "price"],
      ["nl", "Welk gebouw is dit?", "building"],
    ];
    for (const [locale, text, id] of cases) expect(classify(text, locale), `${locale}: ${text}`).toEqual({ kind: "qa", id });
  });

  it("has a reply in every locale for every question it recognises", () => {
    for (const locale of locales) {
      for (const id of QA_IDS) expect(demoOf(locale).owl.qa[id], `${locale} qa.${id}`).toBeTruthy();
    }
  });
});

describe("demo identity questions", () => {
  // Detection itself is tested in packages/shared (identity-question.test.ts);
  // these check how the demo uses it.

  it("runs before answer and Q&A matching", () => {
    expect(classify("are you a bot? how far is it?", "en")).toEqual({ kind: "identity", identity: "machine" });
    expect(classify("are you AI? is it Father Time?", "en")).toEqual({ kind: "identity", identity: "ai" });
    expect(classify("who are you", "en")).toEqual({ kind: "identity", identity: "who" });
    expect(classify("are you a real person?", "en")).toEqual({ kind: "identity", identity: "person" });
  });

  it("still takes a French answer with \"j'ai\" in it as the answer", () => {
    expect(classify("j'ai trouvé : le Père Temps", "fr")).toEqual({ kind: "correct" });
  });

  it("answers \"are you a bot?\" and \"are you AI?\" differently", () => {
    for (const locale of locales as SupportedLanguage[]) {
      const bot = { en: "are you a bot?", es: "¿eres un bot?", fr: "tu es un robot ?", de: "bist du ein Bot?", nl: "ben je een bot?" }[locale];
      const ai = { en: "are you an AI?", es: "¿eres una IA?", fr: "es-tu une IA ?", de: "bist du eine KI?", nl: "ben je een AI?" }[locale];
      expect(classify(bot, locale), `${locale}: ${bot}`).toEqual({ kind: "identity", identity: "machine" });
      expect(classify(ai, locale), `${locale}: ${ai}`).toEqual({ kind: "identity", identity: "ai" });
    }
  });

  it("rotates through each kind's replies separately", () => {
    const { state } = play("en", "are you a bot", "are you a robot", "are you human", "is this a computer", "are you a machine", "who are you", "are you AI?");
    expect(owlKeys(state).slice(2)).toEqual([
      "identity.machine.0",
      "identity.machine.1",
      "identity.person.0",
      "identity.machine.2",
      "identity.machine.0",
      "identity.who.0",
      "identity.ai.0",
    ]);
    expect(state.wrongAnswers).toBe(0);
  });

  it("has every reply in every locale", () => {
    for (const locale of locales) {
      const sets = demoOf(locale).owl.identity;
      for (const [kind, count] of Object.entries(IDENTITY_REPLY_COUNTS)) {
        expect(Object.keys(sets[kind] ?? {}), `${locale} ${kind}`).toHaveLength(count);
      }
    }
  });

  it("never opens a bot, AI or who reply with a no", () => {
    // A reply must never falsely deny being automated. Only "are you a real
    // person?" may start with a no, because "not a person" is true.
    const negation = /^(no|not|nope|nah|nein|nicht|kein|non|pas|nee|niet|geen)\b/i;
    for (const locale of locales) {
      const sets = demoOf(locale).owl.identity;
      for (const kind of ["machine", "who", "ai"]) {
        for (const reply of Object.values(sets[kind]) as string[]) {
          expect(reply, `${locale} ${kind}: ${reply}`).not.toMatch(negation);
        }
      }
    }
  });

  it("never claims the game's route or replies are all hand-written", () => {
    // Routes may be drafted with LLM help and then checked by people, so the
    // "are you AI?" answers say people choose and check them. Only a sentence
    // about this page itself (whose lines really are hand-written) may say so.
    const handWritten: Record<string, RegExp> = {
      en: /by hand|written by people/i,
      es: /a mano|escrit\w* por personas/i,
      fr: /à la main|écrit\w* par des humains/i,
      de: /von Hand|schreiben Menschen/i,
      nl: /met de hand|door mensen geschreven/i,
    };
    const thisPage = /^(On this page|En esta página|Sur cette page|Auf dieser Seite|Op deze pagina)\b/;
    for (const locale of locales) {
      for (const reply of Object.values(demoOf(locale).owl.identity.ai) as string[]) {
        for (const sentence of reply.split(/(?<=[.?])\s+/u)) {
          if (thisPage.test(sentence)) continue;
          expect(sentence, `${locale}: ${reply}`).not.toMatch(handWritten[locale]);
        }
      }
    }
  });

  it("mentions AI only in the answers to \"are you AI?\", which say so", () => {
    const aiWord: Record<string, RegExp> = { en: /\bAI\b/, es: /\bIA\b/, fr: /\bIA\b/, de: /\bKI\b/, nl: /\bAI\b/ };
    for (const locale of locales) {
      const sets = demoOf(locale).owl.identity;
      for (const reply of Object.values(sets.ai) as string[]) expect(reply, locale).toMatch(aiWord[locale]);
      for (const kind of ["machine", "person", "who"]) {
        for (const reply of Object.values(sets[kind]) as string[]) {
          expect(reply, `${locale} ${kind}`).not.toMatch(/\bA\.?I\b|\bIA\b|\bKI\b|\bbots?\b|GPT|artificial|artificielle|künstlich|kunstmatig/i);
        }
      }
    }
  });
});

describe("demo flow", () => {
  it("opens with the intro and the clue", () => {
    const state = initialDemoState();
    expect(owlKeys(state)).toEqual(["intro", "clue"]);
    expect(state.phase).toBe("playing");
  });

  it("goes intro → clue → wrong → hint → correct → done → reset", () => {
    let state = initialDemoState();
    const step = (text: string) => {
      const result = sendMessage(state, text, "en");
      state = result.state;
      return result.events;
    };

    expect(step("The Grim Reaper?")).toEqual([
      { type: "started" },
      { type: "answered", result: "incorrect" },
    ]);
    expect(lastOwl(state)).toBe("wrongGuess");

    expect(step("Hint please")).toEqual([{ type: "hint", hint: 1, revealed: false }]);
    expect(lastOwl(state)).toBe("hints.0");

    expect(step("Father Time")).toEqual([
      { type: "answered", result: "correct" },
      { type: "completed", hints: 1, wrongAnswers: 1 },
    ]);
    expect(owlKeys(state).slice(-3)).toEqual(["success", "funFact", "outro"]);
    expect(state.phase).toBe("done");

    // After the one clue, everything gets the same line and no more events.
    expect(step("Father Time")).toEqual([]);
    expect(lastOwl(state)).toBe("done");

    state = initialDemoState();
    expect(owlKeys(state)).toEqual(["intro", "clue"]);
    expect(step("hello")).toEqual([{ type: "started" }]);
  });

  it("gives two hints, then reveals the answer like a real game", () => {
    const { state, events } = play("en", "hint", "hint", "hint", "hint");
    expect(owlKeys(state).slice(2)).toEqual(["hints.0", "hints.1", "reveal", "reveal"]);
    expect(events.filter((e) => e.type === "hint")).toEqual([
      { type: "hint", hint: 1, revealed: false },
      { type: "hint", hint: 2, revealed: false },
      { type: "hint", hint: HINT_COUNT + 1, revealed: true },
      { type: "hint", hint: HINT_COUNT + 1, revealed: true },
    ]);
  });

  it("nudges towards a hint after a few wrong guesses, but only before one is asked for", () => {
    expect(owlKeys(play("en", "big ben", "the mayor", "a pigeon").state).slice(2)).toEqual([
      "wrong.0",
      "wrong.1",
      "wrong.2",
    ]);
    expect(lastOwl(play("en", "hint", "big ben", "the mayor", "a pigeon").state)).toBe("wrong.1");
  });

  it("answers questions without counting them as guesses", () => {
    const { state, events } = play("en", "how far is it?", "are you a real person?", "what is the meaning of life, really?");
    expect(owlKeys(state).slice(2)).toEqual(["qa.distance", "identity.person.0", "fallback"]);
    expect(state.wrongAnswers).toBe(0);
    expect(events).toEqual([{ type: "started" }]);
  });

  it("ignores empty messages and caps long ones", () => {
    const empty = sendMessage(initialDemoState(), "   ", "en");
    expect(empty.events).toEqual([]);
    expect(empty.state.messages).toHaveLength(2);
    const long = sendMessage(initialDemoState(), "x ".repeat(500), "en").state.messages[2];
    expect(long.from === "you" && long.text.length).toBeLessThanOrEqual(200);
  });

  it("has a line in every locale for every key the engine can send", () => {
    const keys = ["intro", "clue", "wrongGuess", "close", "reveal", "success", "funFact", "outro", "fallback", "done"];
    for (const locale of locales) {
      const owl = demoOf(locale).owl;
      for (const key of keys) expect(owl[key], `${locale} owl.${key}`).toBeTruthy();
      for (const i of [0, 1, 2]) expect(owl.wrong[i], `${locale} owl.wrong.${i}`).toBeTruthy();
      for (let i = 0; i < HINT_COUNT; i++) expect(owl.hints[i], `${locale} owl.hints.${i}`).toBeTruthy();
    }
  });
});

describe("demo copy", () => {
  // The same list as the site-wide test in smoke.test.ts, applied to the demo
  // on its own so a failure points here. The trigger lists in
  // src/lib/demo/script.ts may contain these words: visitors type them, and
  // they are never shown.
  const aiTerms: Record<string, RegExp[]> = {
    shared: [/\bA\.?I\b/, /chat ?bots?/i, /\bbots?\b/i, /\bLLMs?\b/, /\bGPT/, /DeepSeek/i, /machine learning/i, /artificial intelligence/i],
    es: [/\bIA\b/, /inteligencia artificial/i],
    fr: [/\bIA\b/, /intelligence artificielle/i],
    de: [/\bKI\b/, /künstliche[nr]? Intelligenz/i],
    nl: [/kunstmatige intelligentie/i],
  };

  it("mentions AI only in the exempt answers to \"are you AI?\", and has no exclamation marks", () => {
    const leaves = (value: unknown, prefix: string): [string, string][] =>
      typeof value === "string"
        ? [[prefix, value]]
        : Object.entries(value as object).flatMap(([k, v]) => leaves(v, `${prefix}.${k}`));
    for (const locale of locales) {
      for (const [key, value] of leaves(demoOf(locale), "demo")) {
        expect(value, `${locale} ${key}`).not.toMatch(/[!¡]/);
        if (AI_EXEMPT_MESSAGE_KEYS.includes(key)) continue;
        for (const term of [...aiTerms.shared, ...(aiTerms[locale] ?? [])]) {
          expect(value.match(term)?.[0], `${locale} ${key} ${term}`).toBeUndefined();
        }
      }
    }
  });

  it("keeps each of the Owl's lines to two sentences, as the guide's voice does", () => {
    const lines = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Object.values(value as object).flatMap(lines);
    for (const locale of locales) {
      for (const line of lines(demoOf(locale).owl)) {
        expect(line.split(/(?<=[.?])\s+/u).length, `${locale}: ${line}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("says on the page that it is a sample and what happens on the day", () => {
    expect(demoOf("en").caption).toBe("A two-minute taste. On the day, the Owl replies to what your group types.");
    for (const locale of locales) expect(demoOf(locale).owl.intro, locale).toBeTruthy();
  });

  it("keeps the demo clue off the route's stops", () => {
    // The seed route's stops in every language they're accepted in, plus the
    // avoid list. The demo is labelled a sample, so it must not give away (or
    // even picture) a real answer. Checks the copy and the matching lists.
    const spoilers =
      /Town Hall|Corn Exchange|Kirkgate|Minster|Art Gallery|Parish Church|Ayuntamiento|Lonja|Catedral|Galería de Arte|Hôtel de Ville|Bourse aux Céréales|Cathédrale|Galerie d'Art|Rathaus|Kornbörse|Münster|Kunstgalerie|Stadhuis|Korenbeurs|Kathedraal/i;
    for (const locale of locales) {
      expect(JSON.stringify(demoOf(locale)), locale).not.toMatch(spoilers);
    }
    expect(JSON.stringify(DEMO_SCRIPTS)).not.toMatch(spoilers);
  });
});
