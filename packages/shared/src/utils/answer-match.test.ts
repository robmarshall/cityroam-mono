import { describe, expect, it } from "vitest";
import {
  containsPhraseFromList,
  deterministicAnswerMatch,
  editDistance,
  matchesWordList,
  nearAnswerMatch,
  normaliseText,
  stripAccents,
  tokenizeAnswer,
} from "./answer-match.js";

describe("normalisation", () => {
  it("strips accents", () => {
    expect(stripAccents("Père Café Straße")).toBe("Pere Cafe Straße");
  });

  it("lowercases, drops punctuation and collapses whitespace", () => {
    expect(normaliseText("  St. Paul's,   CHURCH?! ")).toBe("st paul s church");
  });

  it("tokenises the way answers are compared", () => {
    expect(tokenizeAnswer("St. Paul's")).toEqual(["st", "paul", "s"]);
    expect(tokenizeAnswer("¿El Padre Tiempo?")).toEqual(["el", "padre", "tiempo"]);
    expect(tokenizeAnswer("   ")).toEqual([]);
  });

  it("measures edit distance", () => {
    expect(editDistance("time", "time")).toBe(0);
    expect(editDistance("father", "farther")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("deterministicAnswerMatch", () => {
  const answers = ["Father Time", "Old Father Time"];

  it("matches case-insensitively inside a sentence", () => {
    expect(deterministicAnswerMatch("is it FATHER TIME?", answers)).toBe(true);
  });

  it("ignores leading articles on either side", () => {
    expect(deterministicAnswerMatch("the town hall", ["Town Hall"])).toBe(true);
    expect(deterministicAnswerMatch("town hall", ["the Town Hall"])).toBe(true);
  });

  it("matches accented answers with or without the accents", () => {
    expect(deterministicAnswerMatch("le pere temps", ["le Père Temps"], "fr")).toBe(true);
    expect(deterministicAnswerMatch("Le Père Temps", ["le pere temps"], "fr")).toBe(true);
  });

  it("accepts English answers in another game language", () => {
    expect(deterministicAnswerMatch("the father time", answers, "de")).toBe(true);
  });

  it("rejects a negated answer", () => {
    expect(deterministicAnswerMatch("definitely not father time", answers)).toBe(false);
    expect(deterministicAnswerMatch("it isn't father time", answers)).toBe(false);
    expect(deterministicAnswerMatch("nicht Vater Zeit", ["Vater Zeit"], "de")).toBe(false);
  });

  it("needs whole words", () => {
    expect(deterministicAnswerMatch("fathertime", answers)).toBe(false);
    expect(deterministicAnswerMatch("time", answers)).toBe(false);
    expect(deterministicAnswerMatch("", answers)).toBe(false);
  });
});

describe("nearAnswerMatch", () => {
  it("absorbs a typo or two", () => {
    expect(nearAnswerMatch("farther time", ["Father Time"])).toBe(true);
    expect(nearAnswerMatch("fathr tme", ["Father Time"])).toBe(true);
  });

  it("expands abbreviations", () => {
    expect(nearAnswerMatch("st peters", ["Saint Peters"])).toBe(true);
  });

  it("rejects something else entirely", () => {
    expect(nearAnswerMatch("grim reaper", ["Father Time"])).toBe(false);
  });

  it("still honours negation", () => {
    expect(nearAnswerMatch("not farther time", ["Father Time"])).toBe(false);
  });
});

describe("word lists", () => {
  it("finds a phrase as whole words only", () => {
    expect(containsPhraseFromList("Hint please", ["hint"])).toBe(true);
    expect(containsPhraseFromList("how far is it?", ["how far"])).toBe(true);
    expect(containsPhraseFromList("that was helpful", ["help"])).toBe(false);
    expect(containsPhraseFromList("¿Cuánto falta?", ["cuanto falta"])).toBe(true);
  });

  it("matches a whole message against a word list", () => {
    expect(matchesWordList("Yes!", ["yes"])).toBe(true);
    expect(matchesWordList("si", ["sí"])).toBe(true);
    expect(matchesWordList("yes please", ["yes"])).toBe(false);
  });
});
