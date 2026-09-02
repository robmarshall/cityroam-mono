import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { locales, defaultLocale } from "../i18n/config";

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

  it("keeps every locale's top-level keys in step with the default", () => {
    const expected = Object.keys(load(defaultLocale)).sort();
    expect(expected.length).toBeGreaterThan(0);

    for (const locale of locales) {
      expect(Object.keys(load(locale)).sort()).toEqual(expected);
    }
  });
});
