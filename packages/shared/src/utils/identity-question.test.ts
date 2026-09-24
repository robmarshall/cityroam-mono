import { describe, expect, it } from "vitest";
import type { SupportedLanguage } from "../types/index.js";
import { classifyIdentityQuestion, type IdentityQuestionKind } from "./identity-question.js";

const cases: Record<SupportedLanguage, [string, IdentityQuestionKind | null][]> = {
  en: [
    ["Are you a bot?", "machine"],
    ["Are you AI?", "ai"],
    ["are you an AI?", "ai"],
    ["is this AI?", "ai"],
    ["is this ChatGPT", "ai"],
    ["is it artificial intelligence?", "ai"],
    ["are you a real person or an AI?", "ai"],
    ["are you a computer", "machine"],
    ["is this automated?", "machine"],
    ["are you a real person or a bot?", "machine"],
    ["Are you a real person?", "person"],
    ["are you human", "person"],
    ["are you real", "person"],
    ["is someone typing this?", "person"],
    ["Who are you?", "who"],
    ["what are you", "who"],
    ["what's your name", "who"],
    ["is this the real building?", null],
    ["who built this?", null],
    ["is it a person?", null],
    ["is it real gold?", null],
    ["Father Time", null],
    ["how far is it?", null],
  ],
  es: [
    ["¿Eres un bot?", "machine"],
    ["¿Eres una IA?", "ai"],
    ["¿Es inteligencia artificial?", "ai"],
    ["¿Eres un robot?", "machine"],
    ["¿Eres una persona real?", "person"],
    ["¿Eres humano?", "person"],
    ["¿Hay alguien escribiendo?", "person"],
    ["¿Quién eres?", "who"],
    ["¿Cómo te llamas?", "who"],
    ["¿Es el edificio de verdad?", null],
    ["¿Quién construyó esto?", null],
    ["el Padre Tiempo", null],
  ],
  fr: [
    ["Tu es un robot ?", "machine"],
    ["C'est une IA ?", "ai"],
    ["Es-tu une IA ?", "ai"],
    ["Es-tu une machine ?", "machine"],
    ["Est-ce une vraie personne ?", "person"],
    ["Es-tu humain ?", "person"],
    ["Quelqu'un écrit ?", "person"],
    ["Qui es-tu ?", "who"],
    ["J'ai trouvé : le Père Temps", null],
    ["Qui a construit ça ?", null],
    ["C'est le vrai bâtiment ?", null],
  ],
  de: [
    ["Bist du ein Bot?", "machine"],
    ["Bist du eine KI?", "ai"],
    ["Ist das künstliche Intelligenz?", "ai"],
    ["Bist du ein Computer?", "machine"],
    ["Bist du ein Mensch?", "person"],
    ["Bist du echt?", "person"],
    ["Tippt da jemand?", "person"],
    ["Wer bist du?", "who"],
    ["Wie heißt du?", "who"],
    ["Ist das das echte Gebäude?", null],
    ["Wer hat das gebaut?", null],
    ["Ist es ein Mensch?", null],
  ],
  nl: [
    ["Ben je een bot?", "machine"],
    ["Is dit AI?", "ai"],
    ["Ben je AI?", "ai"],
    ["Ben je een AI?", "ai"],
    ["Ben je een robot?", "machine"],
    ["Ben je een echte persoon?", "person"],
    ["Ben jij echt?", "person"],
    ["Typt er iemand?", "person"],
    ["Wie ben jij?", "who"],
    ["Hoe heet je?", "who"],
    ["Is dit het echte gebouw?", null],
    ["Wie heeft dit gebouwd?", null],
    ["Is het een mens?", null],
  ],
};

describe("classifyIdentityQuestion", () => {
  for (const [language, list] of Object.entries(cases) as [SupportedLanguage, [string, IdentityQuestionKind | null][]][]) {
    it(`classifies ${language} questions`, () => {
      for (const [text, kind] of list) {
        expect(classifyIdentityQuestion(text, language), `${language}: ${text}`).toBe(kind);
      }
    });
  }

  it("keeps bots, robots and computers apart from AI", () => {
    for (const text of ["are you a bot?", "are you a robot", "are you a computer?", "is this automated?"]) {
      expect(classifyIdentityQuestion(text, "en"), text).toBe("machine");
    }
  });

  it("falls back to English in other languages", () => {
    expect(classifyIdentityQuestion("are you a bot", "de")).toBe("machine");
    expect(classifyIdentityQuestion("who are you", "es")).toBe("who");
  });

  it("does not read French \"j'ai\" as AI", () => {
    expect(classifyIdentityQuestion("j'ai une idée", "fr")).toBeNull();
  });

  it("defaults to English", () => {
    expect(classifyIdentityQuestion("are you human?")).toBe("person");
  });
});
