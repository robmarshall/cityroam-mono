import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colors } from "@cityroam/shared/tailwind/values";
import { BRAND } from "../lib/site";

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.x contrast ratio, rounded down to two places so 4.499 never passes. */
function contrast(a: string, b: string): number {
  return Math.floor(ratio(a, b) * 100) / 100;
}

const AA_TEXT = 4.5;
/** Focus rings, icons and other non-text UI (WCAG 1.4.11). */
const AA_UI = 3;

type Pair = { fg: keyof typeof BRAND; bg: keyof typeof BRAND; min: number; where: string };

/**
 * Every foreground/background pair the marketing chrome actually uses. Add a
 * row when a component starts using a new pair; the test then says whether
 * it's allowed.
 */
const USED: Pair[] = [
  // Page text
  { fg: "ink900", bg: "stone50", min: AA_TEXT, where: "headings and body on the page" },
  { fg: "ink900", bg: "white", min: AA_TEXT, where: "headings on white bands and cards" },
  { fg: "ink900", bg: "stone100", min: AA_TEXT, where: "text in stone-100 boxes, language menu" },
  { fg: "ink900", bg: "brick100", min: AA_TEXT, where: "refund promise heading" },
  { fg: "ink700", bg: "stone50", min: AA_TEXT, where: "body copy, nav links" },
  { fg: "ink700", bg: "white", min: AA_TEXT, where: "body copy on white" },
  { fg: "ink700", bg: "stone100", min: AA_TEXT, where: "mobile language buttons" },
  { fg: "ink700", bg: "brick100", min: AA_TEXT, where: "refund promise text" },
  { fg: "muted", bg: "stone50", min: AA_TEXT, where: "secondary text, small print" },
  { fg: "muted", bg: "white", min: AA_TEXT, where: "card descriptions" },
  { fg: "muted", bg: "stone100", min: AA_TEXT, where: "checkout success boxes" },
  // Brick accents on light grounds
  { fg: "brick500", bg: "stone50", min: AA_TEXT, where: "brick text on the page" },
  { fg: "brick600", bg: "stone50", min: AA_TEXT, where: "links, step numbers, 404 label" },
  { fg: "brick600", bg: "white", min: AA_TEXT, where: "pricing badge, links on white" },
  { fg: "brick600", bg: "stone100", min: AA_TEXT, where: "links in stone-100 boxes" },
  { fg: "brick600", bg: "brick100", min: AA_TEXT, where: "comparison table City Roam column head" },
  // Buttons
  { fg: "white", bg: "brick500", min: AA_TEXT, where: "primary button" },
  { fg: "white", bg: "brick600", min: AA_TEXT, where: "primary button hover" },
  { fg: "stone50", bg: "brick500", min: AA_TEXT, where: "stone text on brick" },
  { fg: "stone50", bg: "ink900", min: AA_TEXT, where: "secondary button hover, mobile current language" },
  // Navy bands and footer
  { fg: "stone50", bg: "ink900", min: AA_TEXT, where: "navy band headings" },
  { fg: "stone100", bg: "ink900", min: AA_TEXT, where: "footer links" },
  { fg: "stone200", bg: "ink900", min: AA_TEXT, where: "navy band notes, footer text" },
  { fg: "ink900", bg: "stone50", min: AA_TEXT, where: "inverse button on navy" },
  // Non-text
  { fg: "ink900", bg: "stone50", min: AA_UI, where: "focus ring on stone" },
  { fg: "ink900", bg: "white", min: AA_UI, where: "focus ring on white" },
  { fg: "stone50", bg: "ink900", min: AA_UI, where: "focus ring on navy" },
  { fg: "brick500", bg: "stone50", min: AA_UI, where: "check icons, fact markers, rules" },
  { fg: "brick500", bg: "white", min: AA_UI, where: "check icons on white" },
];

describe("brand colour contrast", () => {
  it.each(USED)("$fg on $bg ($where) meets $min:1", ({ fg, bg, min }) => {
    expect(contrast(BRAND[fg], BRAND[bg])).toBeGreaterThanOrEqual(min);
  });

  it("matches the ratios recorded in the brand plan", () => {
    // docs/plans/brand-direction-a.md rounds to the nearest hundredth.
    const rounded = (a: string, b: string) => Math.round(ratio(a, b) * 100) / 100;
    expect(rounded(BRAND.white, BRAND.brick500)).toBe(5.45);
    expect(rounded(BRAND.stone50, BRAND.brick500)).toBe(4.84);
    expect(rounded(BRAND.ink900, BRAND.stone50)).toBe(14.19);
    expect(rounded(BRAND.brick500, BRAND.ink900)).toBe(2.93);
  });

  it("keeps brick off navy: it fails even the non-text threshold", () => {
    // The rule that CtaBand, the footer and CTAButton `inverse` rely on.
    expect(contrast(BRAND.brick500, BRAND.ink900)).toBeLessThan(AA_UI);
    expect(contrast(BRAND.brick600, BRAND.ink900)).toBeLessThan(AA_UI);
    expect(USED.some((p) => p.bg === "ink900" && p.fg.startsWith("brick"))).toBe(false);
  });

  it("keeps small brick-500 text off stone-100 (4.39:1)", () => {
    expect(contrast(BRAND.brick500, BRAND.stone100)).toBeLessThan(AA_TEXT);
    expect(USED.some((p) => p.fg === "brick500" && p.bg === "stone100" && p.min === AA_TEXT)).toBe(false);
  });
});

describe("brand palette mirrors", () => {
  const presetCss = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../shared/src/tailwind/preset.css",
    ),
    "utf8",
  );
  const cssToken = (name: string) =>
    presetCss.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();

  const MIRRORED: [keyof typeof BRAND, string, string][] = [
    ["stone50", "stone-50", colors.stone[50]],
    ["stone100", "stone-100", colors.stone[100]],
    ["stone200", "stone-200", colors.stone[200]],
    ["stone300", "stone-300", colors.stone[300]],
    ["ink500", "ink-500", colors.ink[500]],
    ["ink700", "ink-700", colors.ink[700]],
    ["ink900", "ink-900", colors.ink[900]],
    ["brick100", "brick-100", colors.brick[100]],
    ["brick500", "brick-500", colors.brick[500]],
    ["brick600", "brick-600", colors.brick[600]],
    ["muted", "muted", colors.muted],
  ];

  it.each(MIRRORED)("BRAND.%s matches --color-%s and preset.ts", (key, token, ts) => {
    expect(BRAND[key]).toBe(cssToken(token));
    expect(BRAND[key]).toBe(ts);
  });
});
