import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { locales, defaultLocale } from "../i18n/config";

/**
 * The gift pages' copy lives in messages/gift/<locale>.json (merged into the
 * main messages by src/i18n/request.ts). The same rules as smoke.test.ts
 * apply: every locale has every key, placeholders format, no exclamation
 * marks and no talk of AI.
 */
const giftDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../messages/gift");
const mainDir = path.resolve(giftDir, "..");

function load(dir: string, locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, `${locale}.json`), "utf8")) as Record<string, unknown>;
}

const flatten = (value: unknown, prefix = ""): string[] =>
  value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        flatten(v, prefix ? `${prefix}.${k}` : k),
      )
    : [prefix];

describe("gift messages", () => {
  it("ships a gift file for every locale, holding only the gift namespace", () => {
    for (const locale of locales) {
      expect(Object.keys(load(giftDir, locale)), locale).toEqual(["gift"]);
    }
  });

  it("does not clash with a namespace in the main message files", () => {
    // request.ts spreads the gift file over the main one: a `gift` key there
    // would be silently replaced.
    for (const locale of locales) {
      expect(Object.keys(load(mainDir, locale)), locale).not.toContain("gift");
    }
  });

  it("keeps every locale's key set in step with English", () => {
    const expected = flatten(load(giftDir, defaultLocale)).sort();
    for (const locale of locales) {
      expect(flatten(load(giftDir, locale)).sort(), locale).toEqual(expected);
    }
  });

  it("formats every message with the values the pages pass", () => {
    const values = {
      price: "£29",
      max: 10,
      days: 90,
      months: 12,
      email: "hello@cityroam.co.uk",
      date: "24 September 2027",
      count: 12,
      language: "English",
      requested: "Dutch",
      name: "Leeds Classic",
      city: "Leeds",
      minutes: 3,
    };
    for (const locale of locales) {
      const messages = load(giftDir, locale);
      const errors: string[] = [];
      const t = createTranslator({ locale, messages, onError: (e) => errors.push(e.message) }) as unknown as {
        (key: string, v?: Record<string, unknown>): string;
        rich: (key: string, v?: Record<string, unknown>) => unknown;
      };
      const tags = { b: (c: unknown) => c, link: (c: unknown) => c };
      for (const key of flatten(messages)) {
        const raw = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages) as string;
        const out = raw.includes("<")
          ? JSON.stringify(t.rich(key, { ...values, ...tags }))
          : t(key, values);
        expect(out, `${locale} ${key}`).not.toMatch(/[{}]/);
      }
      expect(errors, locale).toEqual([]);
    }
  });

  it("keeps exclamation marks out", () => {
    for (const locale of locales) {
      expect(JSON.stringify(load(giftDir, locale)), locale).not.toMatch(/[!¡]/);
    }
  });

  it("does not describe the guide as an AI", () => {
    // Same list as smoke.test.ts.
    const shared = [
      /\bA\.?I\b/,
      /chat ?bots?/i,
      /\bbots?\b/i,
      /\bLLMs?\b/,
      /\bGPT/,
      /DeepSeek/i,
      /machine learning/i,
      /artificial intelligence/i,
    ];
    const terms: Record<string, RegExp[]> = {
      en: shared,
      es: [...shared, /\bIA\b/, /inteligencia artificial/i],
      fr: [...shared, /\bIA\b/, /intelligence artificielle/i],
      de: [...shared, /\bKI\b/, /künstliche[nr]? Intelligenz/i],
      nl: [...shared, /kunstmatige intelligentie/i],
    };
    for (const locale of locales) {
      const text = JSON.stringify(load(giftDir, locale));
      for (const term of terms[locale] ?? shared) {
        expect(text.match(term)?.[0], `${locale} ${term}`).toBeUndefined();
      }
    }
  });

  it("uses a valid voucher code in every example", () => {
    // The examples must pass the code alphabet, or they teach the wrong thing.
    for (const locale of locales) {
      const examples = JSON.stringify(load(giftDir, locale)).match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}\b/g) ?? [];
      expect(examples.length, locale).toBeGreaterThan(0);
      for (const code of examples) expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789-]+$/);
    }
  });
});
