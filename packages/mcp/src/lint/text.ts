/** Text heuristics: sentence counting and success-acknowledgement detection. */

/** Words that end in "." without ending a sentence, including single-letter initials ("J.", "n. Chr."). */
const ABBREVIATION =
  /(?:^|[\s(])(?:St|Mr|Mrs|Ms|Dr|Sr|Jr|Prof|Mt|approx|vs|etc|e\.g|i\.e|ca|Chr|bzw|Nr|z\.\s?B|d\.\s?h|[A-Za-z])$/;

/** German writes ordinals with a period ("im 13. Jahrhundert"). */
const ORDINAL_LANGUAGES = new Set(["de"]);

/**
 * Counts sentences: runs of `.`, `!`, `?` or `…` followed by whitespace or the
 * end of the text, not counting common abbreviations and initials ("St.",
 * "Dr.", "J."), plus any trailing text without terminal punctuation. Decimal
 * points ("6.5") never end a sentence because no whitespace follows them. For
 * German, "<digits>." followed by a word is an ordinal, not a sentence end.
 */
export function countSentences(text: string, language = "en"): number {
  const t = text.trim();
  if (!t) return 0;
  let count = 0;
  let lastEnd = 0;
  for (const m of t.matchAll(/[.!?…]+["'”’»)\]]*(?=\s|$)/g)) {
    const index = m.index ?? 0;
    const before = t.slice(lastEnd, index);
    if (m[0] === "." && ABBREVIATION.test(before)) continue;
    if (m[0] === "." && ORDINAL_LANGUAGES.has(language) && /\d$/.test(before) && /^\s+\p{L}/u.test(t.slice(index + 1))) {
      continue;
    }
    if (!/[\p{L}\p{N}]/u.test(before)) continue;
    count++;
    lastEnd = index + m[0].length;
  }
  if (/[\p{L}\p{N}]/u.test(t.slice(lastEnd))) count++;
  return count;
}

/** Lowercase, strip accents, straighten apostrophes, drop leading ¡ ¿ and quotes. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/^[\s¡¿"'“”«»]+/, "");
}

/**
 * Openers that duplicate the automatic success message. Sources: the
 * Anti-Patterns entry ("Well done", "Correct"), content-guide.md > Translation >
 * Personality Across Languages (one per language), guide-personality.md >
 * success (English), and the seeded success banks for es/fr/de/nl
 * (packages/api/src/db/seed-message-banks.ts), plus a few unambiguous synonyms.
 * Unknown languages fall back to English only; English is always checked.
 */
export const SUCCESS_OPENERS: Record<string, readonly string[]> = {
  en: [
    "well done", "correct", "that's correct", "that's right", "that's the one", "that's it",
    "got it", "you got it", "right first time", "bang on", "spot on", "nailed it",
    "good job", "great job", "nice one", "nice work", "bravo", "yep, that's it",
  ],
  es: [
    "bien hecho", "correcto", "esa es", "eso es", "si, esa es", "lo tienes", "a la primera",
    "ahi esta", "de lleno", "exacto", "muy bien", "bravo",
  ],
  fr: [
    "bien joue", "bravo", "correct", "c'est ca", "oui, c'est ca", "trouve", "du premier coup",
    "et voila", "en plein dans le mille", "exact", "exactement",
  ],
  de: [
    "gut gemacht", "richtig", "stimmt", "das ist es", "ja, das stimmt", "getroffen",
    "beim ersten versuch", "da ist es", "volltreffer", "genau", "bravo",
  ],
  nl: [
    "goed gedaan", "correct", "klopt", "ja, dat klopt", "dat is 'm", "gevonden",
    "in een keer goed", "daar is het", "raak", "precies", "bravo",
  ],
};

/**
 * Returns the matched opener when the message *starts* with a success
 * acknowledgement that stands on its own — followed by punctuation or the end
 * of the text ("Correct.", "Well done — …"), so "Correct that…" or "Ahí está
 * la catedral" (narration) don't match.
 */
export function successOpener(content: string, language: string): string | null {
  const text = normalizeForMatch(content);
  const langs = language === "en" ? ["en"] : [language, "en"];
  for (const lang of langs) {
    for (const phrase of SUCCESS_OPENERS[lang] ?? []) {
      if (!text.startsWith(phrase)) continue;
      const next = text.slice(phrase.length);
      if (next === "" || /^\s*[.,!?;:…—–-]/.test(next)) return phrase;
    }
  }
  return null;
}

/**
 * Owl puns and clichés the guide never uses (guide-personality.md > The Owl:
 * no "hoot", no "twit-twoo", no "wise old owl"). Matched on normalized text
 * (lowercase, accents stripped) at word boundaries. Every list is checked
 * whatever the route language: a pun is a pun.
 */
export const OWL_PUNS: readonly RegExp[] = [
  // English
  /\bhoot(?:s|ing|ed|er)?\b/,
  /\btwit[\s-]*twoo+\b/,
  /\btu[\s-]*whit\b/,
  /\bto[\s-]*whoo+\b/,
  /\bwhoo+\b/,
  /\bwise old owl\b/,
  /\bowl[\s-]?some\b/,
  /\bowl[\s-]right\b/,
  // Spanish, French, German, Dutch: owl calls and the "wise owl" cliché
  /\bbuho sabio\b/,
  /\bsabio buho\b/,
  /\bhou[\s-]hou\b/,
  /\bhibou sage\b/,
  /\bschuhu\b/,
  /\bweise eule\b/,
  /\boehoe\b/,
  /\bwijze uil\b/,
];

/** Returns the first owl pun or cliché found in the text, or null. */
export function owlPun(content: string): string | null {
  const text = normalizeForMatch(content);
  for (const re of OWL_PUNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}
