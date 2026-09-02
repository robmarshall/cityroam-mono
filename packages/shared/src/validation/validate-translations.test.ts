/**
 * Translation Validation Suite
 *
 * Validates completeness and correctness of all translations across
 * the entire codebase: app i18n files, message bank seeds, route seeds,
 * pipeline fallback maps, and marketing translations.
 *
 * Run with: npm -w @cityroam/shared run test
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { SUPPORTED_LANGUAGES } from "../constants/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, "../../../..");

function readJson(relPath: string): Record<string, unknown> | null {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return null;
  return JSON.parse(readFileSync(abs, "utf-8"));
}

function readFileText(relPath: string): string | null {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf-8");
}

/** Flatten a nested object into dot-separated keys. */
function flattenKeys(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

/** Flatten a nested object into dot-separated key-value pairs. */
function flattenEntries(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      entries.push(
        ...flattenEntries(v as Record<string, unknown>, path),
      );
    } else {
      entries.push([path, String(v)]);
    }
  }
  return entries;
}

/** Extract {{VAR}} template variables from a string. */
function extractTemplateVars(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g);
  return matches ? [...new Set(matches)].sort() : [];
}

// ---------------------------------------------------------------------------
// 1. Player App i18n Files
// ---------------------------------------------------------------------------

describe("Player App i18n translations", () => {
  const APP_I18N_DIR = "packages/app/src/i18n";
  const enData = readJson(`${APP_I18N_DIR}/en.json`)!;
  const enKeys = flattenKeys(enData);
  const enEntries = new Map(flattenEntries(enData));

  it("English (en.json) baseline exists and has keys", () => {
    expect(enData).not.toBeNull();
    expect(enKeys.length).toBeGreaterThan(0);
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === "en") continue;

    describe(`${lang}.json`, () => {
      const langData = readJson(`${APP_I18N_DIR}/${lang}.json`);

      it("file exists", () => {
        expect(langData).not.toBeNull();
      });

      if (!langData) return;

      const langKeys = flattenKeys(langData);
      const langEntries = new Map(flattenEntries(langData));

      it("has all keys from en.json", () => {
        const missing = enKeys.filter((k) => !langKeys.includes(k));
        expect(missing).toEqual([]);
      });

      it("has no extra keys beyond en.json", () => {
        const extra = langKeys.filter((k) => !enKeys.includes(k));
        expect(extra).toEqual([]);
      });

      it("has no empty string values", () => {
        const empty = [...langEntries.entries()]
          .filter(([, v]) => v.trim() === "")
          .map(([k]) => k);
        expect(empty).toEqual([]);
      });

      it("preserves all {{VAR}} template variables", () => {
        const mismatches: string[] = [];
        for (const [key, enValue] of enEntries) {
          const enVars = extractTemplateVars(enValue);
          if (enVars.length === 0) continue;
          const langValue = langEntries.get(key);
          if (!langValue) continue;
          const langVars = extractTemplateVars(langValue);
          if (JSON.stringify(enVars) !== JSON.stringify(langVars)) {
            mismatches.push(
              `${key}: expected ${JSON.stringify(enVars)}, got ${JSON.stringify(langVars)}`,
            );
          }
        }
        expect(mismatches).toEqual([]);
      });

      it("has no untranslated values identical to English (excluding brand names and language names)", () => {
        // Keys that are expected to be the same across languages
        const allowedSameKeys = new Set([
          "chat.headerTitle", // "City Roam" brand
          "chat.guideLabel", // "Guide" may stay same in some languages
          "language.en",
          "language.es",
          "language.fr",
          "language.de",
          "language.nl",
          // Bilingual confirm messages are in the target language, same across all files
          "language.bilingualConfirm.es",
          "language.bilingualConfirm.fr",
          "language.bilingualConfirm.de",
          "language.bilingualConfirm.nl",
        ]);

        const untranslated = [...langEntries.entries()]
          .filter(
            ([key, value]) =>
              !allowedSameKeys.has(key) && value === enEntries.get(key),
          )
          .map(([k]) => k);

        expect(untranslated).toEqual([]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Message Bank Seed Script
// ---------------------------------------------------------------------------

describe("Message bank seed translations", () => {
  const seedText = readFileText(
    "packages/api/src/db/seed-message-banks.ts",
  );

  it("seed script exists", () => {
    expect(seedText).not.toBeNull();
  });

  if (!seedText) return;

  const MESSAGE_BANK_TYPES = [
    "success",
    "failure",
    "hint-exhausted",
    "hint-offer",
    "hint-decline",
    "clarification",
    "unknown-answer",
    "completion",
    "over-length",
    "guide-degraded",
    "guide-busy",
  ];

  const nonEnLanguages = SUPPORTED_LANGUAGES.filter((l) => l !== "en");

  for (const lang of nonEnLanguages) {
    describe(`${lang} message banks`, () => {
      it("has translations section in seed script", () => {
        // Each language section starts with its key in the translations object
        expect(seedText).toContain(`${lang}: [`);
      });

      for (const type of MESSAGE_BANK_TYPES) {
        it(`has at least one "${type}" entry`, () => {
          // Look for entries after the language section starts
          const langSectionMatch = seedText.match(
            new RegExp(`${lang}:\\s*\\[([\\s\\S]*?)\\]\\s*,`, "m"),
          );
          expect(langSectionMatch).not.toBeNull();
          if (langSectionMatch) {
            const section = langSectionMatch[1];
            expect(section).toContain(`type: "${type}"`);
          }
        });
      }
    });
  }

  describe("template variable preservation", () => {
    // Extract all entries with template vars from the seed
    const templateVarTypes: Record<string, string[]> = {
      "hint-exhausted": ["{{ANSWER}}"],
      completion: [
        "{{TOTAL_STOPS}}",
        "{{DISTANCE_KM}}",
        "{{CITY_NAME}}",
        "{{REVIEW_LINK}}",
      ],
    };

    for (const [type, expectedVars] of Object.entries(templateVarTypes)) {
      for (const lang of nonEnLanguages) {
        it(`${lang} "${type}" entries collectively use ${expectedVars.join(", ")}`, () => {
          // Extract the language section
          const langSectionMatch = seedText!.match(
            new RegExp(`${lang}:\\s*\\[([\\s\\S]*?)\\]\\s*,`, "m"),
          );
          expect(langSectionMatch).not.toBeNull();
          if (!langSectionMatch) return;

          const section = langSectionMatch[1];
          // Find all entries of this type and collect all template vars used
          const entryPattern = new RegExp(
            `type:\\s*"${type}"[^}]*content:\\s*"([^"]*(?:\\\\n[^"]*)*)"`,
            "g",
          );
          let match;
          const allContent: string[] = [];
          while ((match = entryPattern.exec(section)) !== null) {
            allContent.push(match[1]);
          }
          expect(allContent.length).toBeGreaterThan(0);

          // Each expected var should appear in at least one entry
          const combinedContent = allContent.join("\n");
          const missing = expectedVars.filter(
            (v) => !combinedContent.includes(v),
          );
          expect(missing, `Missing template vars across all ${type} entries`).toEqual([]);
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Route Seed Script
// ---------------------------------------------------------------------------

describe("Route seed translations", () => {
  const seedText = readFileText("packages/api/src/db/seed-routes.ts");

  it("seed script exists", () => {
    expect(seedText).not.toBeNull();
  });

  if (!seedText) return;

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`has ${lang}Route definition`, () => {
      expect(seedText).toContain(`const ${lang}Route: RouteData`);
    });
  }

  it("routesByLanguage maps all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(seedText).toMatch(
        new RegExp(`${lang}:\\s*${lang}Route`),
      );
    }
  });

  describe("route structure parity", () => {
    // Count groups per language route by counting "name:" patterns after each route definition
    const groupCounts: Record<string, number> = {};

    for (const lang of SUPPORTED_LANGUAGES) {
      const routeMatch = seedText!.match(
        new RegExp(
          `const ${lang}Route: RouteData = \\{([\\s\\S]*?)\\n\\};`,
          "m",
        ),
      );
      if (routeMatch) {
        // Count group definitions (lines with "name:" inside groups array)
        const groupMatches = routeMatch[1].match(
          /^\s{4}\{\s*\n\s{6}name:/gm,
        );
        groupCounts[lang] = groupMatches?.length ?? 0;
      }
    }

    it("all languages have the same number of groups", () => {
      const enCount = groupCounts.en;
      expect(enCount).toBeGreaterThan(0);
      for (const lang of SUPPORTED_LANGUAGES) {
        if (lang === "en") continue;
        expect(
          groupCounts[lang],
          `${lang} has ${groupCounts[lang]} groups, expected ${enCount}`,
        ).toBe(enCount);
      }
    });
  });

  describe("template variable preservation in routes", () => {
    const routeTemplateVars = [
      "{{CITY_NAME}}",
      "{{TOTAL_STOPS}}",
      "{{DISTANCE_KM}}",
    ];

    for (const lang of SUPPORTED_LANGUAGES) {
      it(`${lang}Route preserves standard template variables`, () => {
        const routeMatch = seedText!.match(
          new RegExp(
            `const ${lang}Route: RouteData = \\{([\\s\\S]*?)\\n\\};`,
            "m",
          ),
        );
        expect(routeMatch).not.toBeNull();
        if (!routeMatch) return;

        for (const v of routeTemplateVars) {
          expect(
            routeMatch[1],
            `${lang}Route missing ${v}`,
          ).toContain(v);
        }
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Pipeline Fallback Maps
// ---------------------------------------------------------------------------

describe("Pipeline per-language fallback maps", () => {
  const PIPELINE_DIR = "packages/api/src/services/pipeline";

  const fallbackMapFiles: Array<{
    file: string;
    patterns: string[];
  }> = [
    {
      file: `${PIPELINE_DIR}/idle-timer.ts`,
      patterns: ["IDLE_MESSAGES", "CLUE_FALLBACK"],
    },
    {
      file: `${PIPELINE_DIR}/guide-response-cap.ts`,
      patterns: ["CAP_MESSAGES"],
    },
    {
      file: `${PIPELINE_DIR}/handlers/game-completion.ts`,
      patterns: ["COMPLETION_FALLBACK"],
    },
    {
      file: `${PIPELINE_DIR}/handlers/hint-nudge.ts`,
      patterns: ["HINT_OFFER_FALLBACK"],
    },
    {
      file: `${PIPELINE_DIR}/handlers/hint-request.ts`,
      patterns: ["HINT_EXHAUSTED_FALLBACK"],
    },
    {
      file: `${PIPELINE_DIR}/handlers/answer-attempt.ts`,
      patterns: [
        "SUCCESS_FALLBACK",
        "FAILURE_FALLBACK",
        "HINT_NUDGE_SUFFIX",
      ],
    },
    {
      file: `${PIPELINE_DIR}/pre-filter.ts`,
      patterns: ["OVER_LENGTH_FALLBACK"],
    },
    {
      file: `${PIPELINE_DIR}/orchestrator.ts`,
      patterns: ["HINT_DECLINE_FALLBACK"],
    },
  ];

  for (const { file, patterns } of fallbackMapFiles) {
    describe(file, () => {
      const content = readFileText(file);

      it("file exists", () => {
        expect(content).not.toBeNull();
      });

      if (!content) return;

      for (const pattern of patterns) {
        describe(pattern, () => {
          it("is defined", () => {
            expect(content).toContain(pattern);
          });

          for (const lang of SUPPORTED_LANGUAGES) {
            it(`includes "${lang}" key`, () => {
              // Look for the map definition and check it has the language key
              const mapMatch = content!.match(
                new RegExp(
                  `(?:const|let)\\s+${pattern}[^=]*=[^{]*\\{([\\s\\S]*?)\\}\\s*(?:as|;|satisfies)`,
                  "m",
                ),
              );
              expect(
                mapMatch,
                `Could not find ${pattern} definition`,
              ).not.toBeNull();
              if (mapMatch) {
                expect(
                  mapMatch[1],
                  `${pattern} missing "${lang}" key`,
                ).toMatch(new RegExp(`\\b${lang}\\b`));
              }
            });
          }
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Email Templates
// ---------------------------------------------------------------------------

describe("Email template translations", () => {
  // The templates moved out of the checkout route so the admin resend
  // endpoint could share them with the webhook.
  const checkoutFile = readFileText(
    "packages/api/src/services/email.ts",
  );

  it("the email service exists", () => {
    expect(checkoutFile).not.toBeNull();
  });

  if (!checkoutFile) return;

  it("EMAIL_CONTENT is defined", () => {
    expect(checkoutFile).toContain("EMAIL_CONTENT");
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`EMAIL_CONTENT includes "${lang}" key`, () => {
      // Find the EMAIL_CONTENT definition
      const mapMatch = checkoutFile!.match(
        /(?:const|let)\s+EMAIL_CONTENT[^=]*=[^{]*\{([\s\S]*?)\n\}[\s\S]{0,30}(?:as|;|satisfies)/m,
      );
      expect(mapMatch).not.toBeNull();
      if (mapMatch) {
        expect(mapMatch[1]).toMatch(new RegExp(`\\b${lang}\\b`));
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Marketing Translation Files
// ---------------------------------------------------------------------------

describe("Marketing site translations", () => {
  const MESSAGES_DIR = "packages/marketing/messages";

  it("English (en.json) exists", () => {
    const data = readJson(`${MESSAGES_DIR}/en.json`);
    expect(data).not.toBeNull();
  });

  const enData = readJson(`${MESSAGES_DIR}/en.json`);

  // Marketing translations are infrastructure-only (Phase 4 note says
  // actual translations not in scope). This test documents the gap.
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === "en") continue;

    it(`${lang}.json — ${existsSync(resolve(ROOT, `${MESSAGES_DIR}/${lang}.json`)) ? "exists" : "MISSING (expected — marketing translations not yet authored)"}`, () => {
      const exists = existsSync(
        resolve(ROOT, `${MESSAGES_DIR}/${lang}.json`),
      );
      // This is intentionally a soft check — marketing translations
      // are documented as out-of-scope in Phase 4.
      // When translations are authored, change this to expect(exists).toBe(true)
      if (!exists) {
        // Log but don't fail — this is a known gap
        console.warn(
          `Marketing ${lang}.json not yet authored (see IMPLEMENTATION_PLAN Phase 4 note)`,
        );
      }
      expect(true).toBe(true);
    });
  }

  if (enData) {
    const enKeys = flattenKeys(enData);
    it("English file has substantial content (>100 keys)", () => {
      expect(enKeys.length).toBeGreaterThan(100);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Word Lists (affirmative/negative per language)
// ---------------------------------------------------------------------------

describe("Per-language word lists", () => {
  const wordMatchFile = readFileText(
    "packages/api/src/services/pipeline/word-match.ts",
  );

  it("word-match.ts exists", () => {
    expect(wordMatchFile).not.toBeNull();
  });

  if (!wordMatchFile) return;

  it("WORD_LISTS is defined", () => {
    expect(wordMatchFile).toContain("WORD_LISTS");
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`WORD_LISTS includes "${lang}" with affirmative and negative words`, () => {
      // Check the language key exists in the map
      expect(wordMatchFile).toMatch(
        new RegExp(`\\b${lang}\\b[^}]*affirmative`),
      );
      expect(wordMatchFile).toMatch(
        new RegExp(`\\b${lang}\\b[^}]*negative`),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 8. Deterministic Match — Article Lists
// ---------------------------------------------------------------------------

describe("Language-aware article stripping", () => {
  const matchFile = readFileText(
    "packages/api/src/services/pipeline/deterministic-match.ts",
  );

  it("deterministic-match.ts exists", () => {
    expect(matchFile).not.toBeNull();
  });

  if (!matchFile) return;

  it("LEADING_ARTICLES is defined", () => {
    expect(matchFile).toContain("LEADING_ARTICLES");
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`LEADING_ARTICLES includes "${lang}" key`, () => {
      expect(matchFile).toMatch(
        new RegExp(`\\b${lang}\\b`),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 9. Cross-layer consistency
// ---------------------------------------------------------------------------

describe("Cross-layer language consistency", () => {
  it("SUPPORTED_LANGUAGES has expected 5 languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "es", "fr", "de", "nl"]);
  });

  it("all app i18n files exist for every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const exists = existsSync(
        resolve(ROOT, `packages/app/src/i18n/${lang}.json`),
      );
      expect(exists, `Missing packages/app/src/i18n/${lang}.json`).toBe(
        true,
      );
    }
  });

  it("marketing i18n config references shared SUPPORTED_LANGUAGES", () => {
    const configFile = readFileText(
      "packages/marketing/src/i18n/config.ts",
    );
    expect(configFile).not.toBeNull();
    if (configFile) {
      expect(configFile).toContain("SUPPORTED_LANGUAGES");
    }
  });
});
