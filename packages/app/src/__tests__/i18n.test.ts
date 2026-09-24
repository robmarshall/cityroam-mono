import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import en from "../i18n/en.json";
import es from "../i18n/es.json";
import fr from "../i18n/fr.json";
import de from "../i18n/de.json";
import nl from "../i18n/nl.json";

const CATALOGUES: Record<string, unknown> = { en, es, fr, de, nl };

/** Every string value in a catalogue, keyed by its dotted path. */
function entries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

/**
 * Keys allowed to contain "!" or "¡". Add one only when the mark is genuinely
 * needed (not for tone), with the reason alongside.
 */
const EXCLAMATION_ALLOWED = new Set<string>([]);

describe("app copy", () => {
  it.each(SUPPORTED_LANGUAGES.map((l) => [l]))("%s has no exclamation marks", (lang) => {
    // House style and the guide's voice (docs/llm-authoring/guide-personality.md):
    // dry, never an exclamation mark.
    expect(CATALOGUES[lang], lang).toBeDefined();
    const offenders = entries(CATALOGUES[lang])
      .filter(([key, text]) => /[!¡]/.test(text) && !EXCLAMATION_ALLOWED.has(key))
      .map(([key, text]) => `${key}: ${text}`);
    expect(offenders).toEqual([]);
  });
});
