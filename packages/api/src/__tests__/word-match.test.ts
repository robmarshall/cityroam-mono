import { describe, it, expect } from "vitest";
import {
  matchesWordList,
  isAffirmativeResponse,
  isNegativeResponse,
  AFFIRMATIVE_WORDS,
  NEGATIVE_WORDS,
} from "../services/pipeline/word-match.js";

// ── matchesWordList ──────────────────────────────────────────────────

describe("matchesWordList", () => {
  it("matches an exact word", () => {
    expect(matchesWordList("yes", ["yes"])).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesWordList("YES", ["yes"])).toBe(true);
    expect(matchesWordList("Yes", ["yes"])).toBe(true);
  });

  it("trims whitespace", () => {
    expect(matchesWordList("  yes  ", ["yes"])).toBe(true);
  });

  it("strips trailing punctuation", () => {
    expect(matchesWordList("yes!", ["yes"])).toBe(true);
    expect(matchesWordList("yes.", ["yes"])).toBe(true);
    expect(matchesWordList("yes??", ["yes"])).toBe(true);
    expect(matchesWordList("yes,", ["yes"])).toBe(true);
  });

  it("normalises accents via NFD", () => {
    expect(matchesWordList("sí", ["sí"])).toBe(true);
    expect(matchesWordList("si", ["sí"])).toBe(true);
    expect(matchesWordList("sí", ["si"])).toBe(true);
  });

  it("matches multi-word phrases", () => {
    expect(matchesWordList("go ahead", ["go ahead"])).toBe(true);
    expect(matchesWordList("no thanks", ["no thanks"])).toBe(true);
  });

  it("does not match partial words", () => {
    expect(matchesWordList("yesterday", ["yes"])).toBe(false);
    expect(matchesWordList("nope", ["no"])).toBe(false);
    expect(matchesWordList("yep", ["yes"])).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(matchesWordList("", ["yes"])).toBe(false);
  });

  it("returns false for empty word list", () => {
    expect(matchesWordList("yes", [])).toBe(false);
  });

  it("matches first word in a list of multiple", () => {
    expect(matchesWordList("ok", ["yes", "ok", "sure"])).toBe(true);
  });

  it("does not match when none in list", () => {
    expect(matchesWordList("maybe", ["yes", "ok", "sure"])).toBe(false);
  });
});

// ── isAffirmativeResponse ────────────────────────────────────────────

describe("isAffirmativeResponse", () => {
  describe("English (default)", () => {
    it.each(["yes", "yeah", "yep", "sure", "ok", "okay", "y", "definitely", "absolutely"])(
      "recognises '%s'",
      (word) => {
        expect(isAffirmativeResponse(word)).toBe(true);
      },
    );

    it("rejects negative words", () => {
      expect(isAffirmativeResponse("no")).toBe(false);
      expect(isAffirmativeResponse("nope")).toBe(false);
    });

    it("handles case and punctuation", () => {
      expect(isAffirmativeResponse("YES!")).toBe(true);
      expect(isAffirmativeResponse("  Yeah  ")).toBe(true);
    });
  });

  describe("Spanish", () => {
    it.each(["si", "sí", "vale", "claro", "dale"])("recognises '%s'", (word) => {
      expect(isAffirmativeResponse(word, "es")).toBe(true);
    });

    it("falls back to English", () => {
      expect(isAffirmativeResponse("yes", "es")).toBe(true);
    });
  });

  describe("French", () => {
    it.each(["oui", "ouais", "d'accord"])("recognises '%s'", (word) => {
      expect(isAffirmativeResponse(word, "fr")).toBe(true);
    });

    it("falls back to English", () => {
      expect(isAffirmativeResponse("ok", "fr")).toBe(true);
    });
  });

  describe("German", () => {
    it.each(["ja", "klar", "sicher", "bitte"])("recognises '%s'", (word) => {
      expect(isAffirmativeResponse(word, "de")).toBe(true);
    });
  });

  describe("Dutch", () => {
    it.each(["ja", "zeker", "oké", "graag"])("recognises '%s'", (word) => {
      expect(isAffirmativeResponse(word, "nl")).toBe(true);
    });
  });
});

// ── isNegativeResponse ───────────────────────────────────────────────

describe("isNegativeResponse", () => {
  describe("English (default)", () => {
    it.each(["no", "nah", "nope", "no thanks", "not yet", "n"])(
      "recognises '%s'",
      (word) => {
        expect(isNegativeResponse(word)).toBe(true);
      },
    );

    it("rejects affirmative words", () => {
      expect(isNegativeResponse("yes")).toBe(false);
      expect(isNegativeResponse("ok")).toBe(false);
    });

    it("handles case and punctuation", () => {
      expect(isNegativeResponse("NO!")).toBe(true);
      expect(isNegativeResponse("  Nah  ")).toBe(true);
    });
  });

  describe("Spanish", () => {
    it.each(["no", "no gracias", "todavía no"])("recognises '%s'", (word) => {
      expect(isNegativeResponse(word, "es")).toBe(true);
    });

    it("falls back to English", () => {
      expect(isNegativeResponse("nope", "es")).toBe(true);
    });
  });

  describe("French", () => {
    it.each(["non", "non merci", "pas encore"])("recognises '%s'", (word) => {
      expect(isNegativeResponse(word, "fr")).toBe(true);
    });
  });

  describe("German", () => {
    it.each(["nein", "nö", "nee", "nein danke"])("recognises '%s'", (word) => {
      expect(isNegativeResponse(word, "de")).toBe(true);
    });
  });

  describe("Dutch", () => {
    it.each(["nee", "nee bedankt", "nog niet"])("recognises '%s'", (word) => {
      expect(isNegativeResponse(word, "nl")).toBe(true);
    });
  });
});

// ── Legacy exports ───────────────────────────────────────────────────

describe("legacy exports", () => {
  it("AFFIRMATIVE_WORDS is the English affirmative list", () => {
    expect(AFFIRMATIVE_WORDS).toContain("yes");
    expect(AFFIRMATIVE_WORDS).toContain("ok");
  });

  it("NEGATIVE_WORDS is the English negative list", () => {
    expect(NEGATIVE_WORDS).toContain("no");
    expect(NEGATIVE_WORDS).toContain("nope");
  });
});
