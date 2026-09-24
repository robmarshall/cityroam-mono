import { vi, describe, it, expect } from "vitest";

// identity.ts reaches the database only through the bank helpers, and
// template-vars.ts imports env; both are stubbed so this stays a unit test.
vi.mock("../../env.js", () => ({ env: { REVIEW_LINK: "https://review.test.com" } }));
vi.mock("../../db/index.js", () => ({ db: {}, schema: {} }));
vi.mock("../../services/pipeline/handlers/answer-attempt.js", () => ({
  getRandomMessageBank: vi.fn().mockResolvedValue(null),
  writeGuideMessage: vi.fn(),
  SCRIPTED_MESSAGE: { countsTowardCap: false },
}));

import type { SupportedLanguage } from "@cityroam/shared/types";
import { opensWithNegation } from "@cityroam/shared/utils";
import { SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import {
  detectIdentityQuestion,
  identityReply,
  IDENTITY_BANK_TYPES,
} from "../../services/pipeline/identity.js";

describe("detectIdentityQuestion", () => {
  const routed: [string, SupportedLanguage, string][] = [
    ["are you AI?", "en", "ai"],
    ["Is this ChatGPT?", "en", "ai"],
    ["are you a person or an AI?", "en", "ai"],
    ["are you a bot?", "en", "machine"],
    ["r u a robot", "en", "machine"],
    ["are you a person or a bot?", "en", "machine"],
    ["are you a real person?", "en", "person"],
    ["is someone typing?", "en", "person"],
    ["who are you?", "en", "who"],
    ["what's your name?", "en", "who"],
    ["who am I talking to?", "en", "who"],
    ["¿Eres una IA?", "es", "ai"],
    ["¿eres un bot?", "es", "machine"],
    ["¿eres una persona real?", "es", "person"],
    ["¿quién eres?", "es", "who"],
    ["are you a bot?", "es", "machine"],
    ["Es-tu une IA ?", "fr", "ai"],
    ["t'es un robot ?", "fr", "machine"],
    ["tu es humain ?", "fr", "person"],
    ["qui es-tu ?", "fr", "who"],
    ["Bist du eine KI?", "de", "ai"],
    ["bist du ein Roboter?", "de", "machine"],
    ["bist du ein Mensch?", "de", "person"],
    ["wer bist du?", "de", "who"],
    ["ben je een AI?", "nl", "ai"],
    ["ben jij een robot?", "nl", "machine"],
    ["ben je een mens?", "nl", "person"],
    ["hoe heet je?", "nl", "who"],
  ];

  it.each(routed)("%s (%s) is %s", (text, language, kind) => {
    expect(detectIdentityQuestion(text, language)).toBe(kind);
  });

  const notRouted: [string, SupportedLanguage][] = [
    // About the clue, not the guide
    ["is it the robot statue?", "en"],
    ["is this a robot?", "en"],
    ["is this the real one?", "en"],
    ["who built this?", "en"],
    ["is it a person?", "en"],
    ["the computer shop", "en"],
    // Everyday questions containing an identity phrase
    ["what are you doing?", "en"],
    ["are you sure it's the computer shop?", "en"],
    ["do you mean the robot on the corner?", "en"],
    ["wat ben je aan het doen?", "nl"],
    ["bist du sicher, dass es der Roboter ist?", "de"],
    // Not questions, or too long to be a plain identity question
    ["you are a bot and I like the robot statue over there by the bridge", "en"],
    ["are you a bot or are you going to tell us where the next stop is please", "en"],
    // Plain questions
    ["how far is the next stop?", "en"],
    ["¿dónde está la siguiente parada?", "es"],
    // French "j'ai" normalises to "j ai"
    ["j'ai une question, c'est loin ?", "fr"],
  ];

  it.each(notRouted)("%s (%s) is left to the classifier", (text, language) => {
    expect(detectIdentityQuestion(text, language)).toBeNull();
  });

  it("lets an answer win over an identity question", () => {
    expect(detectIdentityQuestion("are you the robot?", "en")).toBe("machine");
    expect(detectIdentityQuestion("are you the robot?", "en", ["robot"])).toBeNull();
    expect(detectIdentityQuestion("are you the robot?", "en", ["fountain"])).toBe("machine");
  });
});

describe("identityReply fallbacks", () => {
  const kinds = Object.keys(IDENTITY_BANK_TYPES) as (keyof typeof IDENTITY_BANK_TYPES)[];

  it.each(SUPPORTED_LANGUAGES.map((l) => [l]))("has a reply for every kind in %s, with the name filled in", async (language) => {
    for (const kind of kinds) {
      const reply = await identityReply(kind, language);
      expect(reply, `${language} ${kind}`).not.toContain("{{");
      expect(reply, `${language} ${kind}`).not.toMatch(/[!¡]/);
      if (kind === "machine" || kind === "who") {
        expect(opensWithNegation(reply), `${language} ${kind}: ${reply}`).toBe(false);
      }
    }
  });

  it("uses the name's grammatical form", async () => {
    expect(await identityReply("who", "de")).toContain("Ich bin die Eule, eure Begleiterin");
    expect(await identityReply("who", "es")).toContain("Soy el Búho");
    expect(await identityReply("who", "fr")).toContain("Je suis le Hibou");
    expect(await identityReply("who", "nl")).toContain("Ik ben de Uil");
  });
});
