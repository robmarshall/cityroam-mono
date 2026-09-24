import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { locales } from "@/i18n/config";
import { PAGES } from "@/lib/metadata";
import { PHOTOS } from "@/lib/photos";

const messagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../messages");
const load = (locale: string) =>
  JSON.parse(readFileSync(path.join(messagesDir, `${locale}.json`), "utf8")) as Record<string, any>;

const AUDIENCES = ["families", "henParties", "teamBuilding", "stagParties"] as const;

describe("audience pages", () => {
  it("gives every audience the same message shape in every locale", () => {
    for (const locale of locales) {
      const m = load(locale);
      for (const audience of AUDIENCES) {
        const ns = m[audience];
        const where = `${locale} ${audience}`;
        expect(ns?.hero?.title, where).toBeTruthy();
        expect(ns?.hero?.subtitle, where).toBeTruthy();
        expect(ns?.notes?.hero, where).toBeTruthy();
        expect(ns?.notes?.proof, where).toBeTruthy();
        for (const i of [0, 1, 2]) {
          expect(ns?.proof?.[i]?.title, `${where} proof.${i}`).toBeTruthy();
          expect(ns?.proof?.[i]?.text, `${where} proof.${i}`).toBeTruthy();
        }
        expect(ns?.twoGroups?.text, where).toBeTruthy();
        expect(ns?.cta?.text, where).toBeTruthy();
        expect(m.metadata?.[audience]?.title, where).toBeTruthy();
        expect(m.home?.audiences?.[audience]?.title, where).toBeTruthy();
      }
      expect(m.common.header.stagParties, locale).toBeTruthy();
    }
  });

  it("keeps the Owl's notes off the stops on the route", () => {
    // Margin notes are decoration, so they must never name (or picture) an
    // answer. These are the seed route's stops plus the avoid list.
    const spoilers = /Town Hall|Corn Exchange|Kirkgate|Minster|Art Gallery/i;
    for (const locale of locales) {
      const m = load(locale);
      const notes = [
        m.home.notes,
        ...AUDIENCES.map((a) => m[a].notes),
        m.treasureHunt.notes,
        { success: m.checkout.success.note, notFound: m.notFound.note },
      ];
      expect(JSON.stringify(notes), locale).not.toMatch(spoilers);
    }
  });

  it("has a photo slot for each audience hero, the stag page included", () => {
    for (const slot of ["families", "henParties", "teamBuilding", "stagParties"]) {
      expect(slot in PHOTOS, slot).toBe(true);
    }
  });
});

// The category word per locale, as the positioning review uses it.
const TREASURE_HUNT: Record<string, RegExp> = {
  en: /treasure hunt/i,
  es: /búsqueda del tesoro/i,
  fr: /chasse au trésor/i,
  de: /Schnitzeljagd/i,
  nl: /speurtocht/i,
};

describe("positioning", () => {
  it("leads the home page with exploring, and keeps the treasure hunt term for its own page", () => {
    // Owner decision (2026-09-24): City Roam is a self-guided walk round
    // Leeds with clues. "Treasure hunt" stays in the search-facing places
    // (the home meta description's "part treasure hunt", the families and
    // team-building titles, and /treasure-hunt), not in the headline.
    for (const locale of locales) {
      const m = load(locale);
      const term = TREASURE_HUNT[locale];
      expect(m.metadata.home.title, locale).not.toMatch(term);
      expect(m.home.hero.title, locale).not.toMatch(term);
      expect(m.metadata.og.tagline, locale).not.toMatch(term);
      for (const audience of AUDIENCES) {
        expect(m[audience].hero.title, `${locale} ${audience}`).not.toMatch(term);
      }
      expect(m.metadata.treasureHunt.title, locale).toMatch(term);
      expect(m.treasureHunt.hero.title, locale).toMatch(term);
    }
  });

  it("uses one German word for the game: Schnitzeljagd, never Schatzsuche", () => {
    const files = [
      "../../messages/de.json",
      "../../messages/gift/de.json",
      "../../../app/src/i18n/de.json",
    ];
    for (const file of files) {
      const text = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), file), "utf8");
      expect(text, file).not.toMatch(/Schatzsuche/);
    }
  });

  it("gives the treasure-hunt page the same message shape in every locale", () => {
    for (const locale of locales) {
      const ns = load(locale).treasureHunt;
      expect(ns?.hero?.title, locale).toBeTruthy();
      for (const i of [0, 1, 2, 3]) expect(ns?.differs?.items?.[i]?.text, `${locale} differs.${i}`).toBeTruthy();
      for (const i of [0, 1, 2, 3, 4, 5]) expect(ns?.faq?.[i]?.answer, `${locale} faq.${i}`).toBeTruthy();
    }
  });
});

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists every indexable page once, with an alternate for every locale", () => {
    expect(new Set(urls).size).toBe(urls.length);
    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      expect(Object.keys(languages).sort(), entry.url).toEqual([...locales].sort());
      for (const locale of locales) {
        expect(languages[locale as keyof typeof languages], entry.url).toMatch(new RegExp(`/${locale}(/|$)`));
      }
    }
  });

  it("includes the stag page, the treasure-hunt page and the gift voucher page", () => {
    expect(PAGES.stagParties.path).toBe("/stag-parties");
    expect(urls.some((u) => u.endsWith("/stag-parties"))).toBe(true);
    expect(PAGES.treasureHunt.path).toBe("/treasure-hunt");
    expect(urls.some((u) => u.endsWith("/en/treasure-hunt"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/gift"))).toBe(true);
  });

  it("leaves out the private voucher and checkout pages", () => {
    expect(urls.filter((u) => /\/(redeem|gift\/success|checkout)/.test(u))).toEqual([]);
  });
});
