import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import { locales, defaultLocale } from "../i18n/config";
import { factValues } from "../lib/facts";
import { COMPANY, COMPANY_ADDRESS_LINE } from "../lib/site";

const messagesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../messages",
);

function load(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(messagesDir, `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}

// Smoke test: src/i18n/request.ts imports messages/<locale>.json by dynamic
// template. A locale advertised by shared constants with no message file only
// fails at request time, as a 500 on every page in that language.
describe("marketing smoke", () => {
  it("advertises a non-empty locale list containing the default", () => {
    expect(locales.length).toBeGreaterThan(0);
    expect(locales).toContain(defaultLocale);
  });

  it("ships a message file for every advertised locale", () => {
    for (const locale of locales) {
      expect(() => load(locale)).not.toThrow();
    }
  });

  it("keeps every locale's full key set in step with the default", () => {
    // next-intl renders a missing nested key as the raw key path at runtime,
    // so a top-level comparison alone lets a half-translated page ship.
    const flatten = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
            flatten(v, prefix ? `${prefix}.${k}` : k),
          )
        : [prefix];

    const expected = flatten(load(defaultLocale)).sort();
    for (const locale of locales) {
      expect(flatten(load(locale)).sort(), locale).toEqual(expected);
    }
  });

  it("keeps every locale's top-level keys in step with the default", () => {
    const expected = Object.keys(load(defaultLocale)).sort();
    expect(expected.length).toBeGreaterThan(0);

    for (const locale of locales) {
      expect(Object.keys(load(locale)).sort()).toEqual(expected);
    }
  });

  it("formats every marketing message with the fact values in every locale", () => {
    // A broken ICU placeholder in one translation (a stray apostrophe before
    // a brace, a misspelt {duration}) only shows up at render time, as raw
    // braces on the page or an error.
    for (const locale of locales) {
      const messages = load(locale);
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages,
        onError: (e) => errors.push(e.message),
      }) as unknown as (key: string, values?: Record<string, string | number>) => string;
      const values = factValues((key, v) => t(`facts.${key}`, v));

      const walk = (value: unknown, key: string): void => {
        if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) walk(v, `${key}.${k}`);
        } else if (typeof value === "string" && !value.includes("<")) {
          // `year` and the company details are filled in by the Footer itself.
          const out = t(key, {
            ...values,
            year: 2026,
            name: COMPANY.name,
            number: COMPANY.number,
            address: COMPANY_ADDRESS_LINE,
          });
          expect(out, `${locale} ${key}`).not.toMatch(/[{}]/);
        }
      };
      for (const [ns, value] of Object.entries(messages)) {
        if (ns !== "legal") walk(value, ns);
      }
      expect(errors, locale).toEqual([]);
    }
  });

  it("names the company in the terms and privacy notice of every locale", () => {
    // The legal pages are rendered with t.raw, so the details are plain text
    // there rather than interpolated from COMPANY; this keeps the two in step.
    for (const locale of locales) {
      const legal = load(locale).legal as Record<string, { sections: { bullets?: string[] }[] }>;
      for (const page of ["terms", "privacy"]) {
        const text = JSON.stringify(legal[page].sections);
        expect(text, `${locale} ${page}`).toContain(COMPANY.name);
        expect(text, `${locale} ${page}`).toContain(COMPANY.number);
        expect(text, `${locale} ${page}`).toContain(COMPANY_ADDRESS_LINE);
      }
      // The pre-launch placeholders ("[complete before launch]" and its translations).
      expect(JSON.stringify(legal), locale).not.toMatch(
        /\[(complete before launch|completar antes del lanzamiento|à compléter avant le lancement|vor dem Start ergänzen|aanvullen vóór de lancering)\]/,
      );
    }
  });

  it("keeps exclamation marks out of the marketing copy", () => {
    // House style (and the guide's voice): dry, no exclamation marks.
    for (const locale of locales) {
      const { legal: _legal, ...marketing } = load(locale);
      expect(JSON.stringify(marketing), locale).not.toMatch(/[!¡]/);
    }
  });
});
