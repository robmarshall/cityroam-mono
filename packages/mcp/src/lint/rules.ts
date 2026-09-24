import { parseImagePlaceholder } from "@cityroam/shared/utils";
import { CITATIONS } from "./citations.js";
import { makeIssue, type PathSegment } from "./issue.js";
import { isObj, type NBlock, type NormalizedRoute } from "./normalize.js";
import { ROUTE_TEMPLATE_VARIABLES, templateProblems } from "./templates.js";
import { countSentences, owlPun, successOpener } from "./text.js";
import type { Issue, LintOptions } from "./types.js";

/** Thresholds, with the doc text each comes from. */
export const THRESHOLDS = {
  /** Anti-Patterns: "Wall of text — any message over 3 sentences." */
  maxSentences: 3,
  /** Not in the docs: a character backstop for sentences that run on. */
  maxMessageChars: 300,
  /** Images > When NOT to Use Images: "More than 2 images per group". */
  maxImagesPerGroup: 2,
  /** Anti-Patterns: "Delay-free dumps — 4+ blocks all with delay_ms: 0." */
  delayFreeRun: 4,
  /** En-Route Commentary > Rules: "Max 3 en-route blocks per group". */
  maxEnRouteBlocks: 3,
  /**
   * Delays Between Blocks: "15000-30000ms — First en-route commentary"; every
   * shorter tier is conversational pacing. A block after the question with at
   * least this delay is treated as en-route commentary.
   */
  enRouteMinDelayMs: 15000,
  /** Accepted Answers: "Typically 2-4 accepted answers is enough." */
  minAcceptedAnswers: 2,
  /** Not in the docs (they say 2-4 is typical); translations add both names. */
  maxAcceptedAnswers: 6,
} as const;

/** Map Blocks: `https://maps.google.com/?q=Leeds+Town+Hall`. */
const MAP_LINK = /^https:\/\/maps\.google\.com\/\?q=[^\s&#]+$/;

type Emit = (issue: Issue) => void;

function blockType(b: NBlock): string | undefined {
  if (typeof b.type === "string") return b.type;
  if (b.config && typeof b.config.type === "string") return b.config.type;
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function routeLanguage(route: NormalizedRoute): string {
  const lang = str(route.route?.language);
  return lang ? lang.trim().toLowerCase().split(/[-_]/)[0] : "en";
}

/** Every text field a player sees, with the template keys substituted there. */
function* textFields(
  b: NBlock,
): Generator<{ seg: PathSegment[]; text: string; allowed: readonly string[]; field: string }> {
  const c = b.config;
  if (!c) return;
  const content = str(c.content);
  if (content !== undefined && c.type === "message") {
    yield { seg: ["config", "content"], text: content, allowed: ROUTE_TEMPLATE_VARIABLES, field: "message content" };
  }
  const clue = str(c.clue);
  if (clue !== undefined) yield { seg: ["config", "clue"], text: clue, allowed: [], field: "a question clue" };
  if (Array.isArray(c.accepted_answers)) {
    for (const [k, a] of c.accepted_answers.entries()) {
      if (typeof a === "string") {
        yield { seg: ["config", "accepted_answers", k], text: a, allowed: [], field: "an accepted answer" };
      }
    }
  }
  if (Array.isArray(c.hints)) {
    for (const [h, hint] of c.hints.entries()) {
      if (!Array.isArray(hint)) continue;
      for (const [i, item] of hint.entries()) {
        if (isObj(item) && typeof item.content === "string") {
          yield {
            seg: ["config", "hints", h, i, "content"],
            text: item.content,
            allowed: ROUTE_TEMPLATE_VARIABLES,
            field: "hint text",
          };
        }
      }
    }
  }
  const label = str(c.label);
  if (label !== undefined) yield { seg: ["config", "label"], text: label, allowed: [], field: "an action label" };
  const link = str(c.google_maps_link);
  if (link !== undefined) yield { seg: ["config", "google_maps_link"], text: link, allowed: [], field: "a map link" };
}

/** Every image reference in a block: image block URL and hint images. */
function* imageRefs(b: NBlock): Generator<{ seg: PathSegment[]; value: string }> {
  const c = b.config;
  if (!c) return;
  if (c.type === "image" && typeof c.image_url === "string") {
    yield { seg: ["config", "image_url"], value: c.image_url };
  }
  if (Array.isArray(c.hints)) {
    for (const [h, hint] of c.hints.entries()) {
      if (!Array.isArray(hint)) continue;
      for (const [i, item] of hint.entries()) {
        if (isObj(item) && typeof item.image_url === "string") {
          yield { seg: ["config", "hints", h, i, "image_url"], value: item.image_url };
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export function errorRules(route: NormalizedRoute, emit: Emit): void {
  route.groups.forEach((group, g) => {
    group.blocks.forEach((b, i) => {
      const at: PathSegment[] = ["groups", g, "blocks", i];
      const cfgType = b.config?.type;

      if (typeof b.type === "string" && typeof cfgType === "string" && b.type !== cfgType) {
        emit(
          makeIssue(route, "block-type-mismatch", [...at, "type"],
            `Block type "${b.type}" does not match config.type "${cfgType}"`, CITATIONS.blockTypes),
        );
      }

      for (const f of textFields(b)) {
        for (const p of templateProblems(f.text, f.allowed, f.field)) {
          emit(makeIssue(route, p.rule, [...at, ...f.seg], p.message, CITATIONS.templates));
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

export function warningRules(route: NormalizedRoute, options: LintOptions, emit: Emit): void {
  const groups = route.groups;
  const language = routeLanguage(route);
  const placeholders: string[] = [];

  groups.forEach((group, g) => {
    const types = group.blocks.map(blockType);
    const firstQ = types.indexOf("question");
    const lastQ = types.lastIndexOf("question");
    const gAt: PathSegment[] = ["groups", g];

    // First group is the conversational introduction — no question.
    if (g === 0 && firstQ !== -1) {
      emit(makeIssue(route, "first-group-question", [...gAt, "blocks", firstQ],
        "The first group should be a conversational introduction with no question", CITATIONS.intro));
    }

    // Every location group between the intro and the closing group has a riddle.
    if (g > 0 && g < groups.length - 1 && firstQ === -1) {
      emit(makeIssue(route, "group-missing-question", gAt,
        "This group has no question block; location groups start with the riddle for the stop (only the introduction and closing groups may omit one)",
        CITATIONS.groupQuestion));
    }

    // Spoiler images.
    if (firstQ > 0) {
      types.slice(0, firstQ).forEach((t, i) => {
        if (t === "image") {
          emit(makeIssue(route, "image-before-question", [...gAt, "blocks", i],
            "Image block before the question in this group — showing the location before the riddle spoils it",
            CITATIONS.imagesNot));
        }
      });
    }

    const imageCount = types.filter((t) => t === "image").length;
    if (imageCount > THRESHOLDS.maxImagesPerGroup) {
      emit(makeIssue(route, "too-many-images", gAt,
        `${imageCount} image blocks in this group; use at most ${THRESHOLDS.maxImagesPerGroup} (visual fatigue)`,
        CITATIONS.imagesNot));
    }

    // Delay-free dumps. Questions and actions pause the flow, so they end a run.
    let runStart = -1;
    let runLength = 0;
    const flush = () => {
      if (runLength >= THRESHOLDS.delayFreeRun) {
        emit(makeIssue(route, "delay-free-run", [...gAt, "blocks", runStart],
          `${runLength} consecutive blocks with delay_ms 0 starting here; the player gets them all at once`,
          CITATIONS.delayFree));
      }
      runStart = -1;
      runLength = 0;
    };
    group.blocks.forEach((b, i) => {
      if (b.delay_ms === 0 || b.delay_ms === undefined) {
        if (runStart === -1) runStart = i;
        runLength++;
      } else {
        flush();
      }
      if (types[i] === "question" || types[i] === "action") flush();
    });
    flush();

    // En-route commentary: long-delay blocks after the (last) question.
    const enRoute = group.blocks
      .slice(lastQ + 1)
      .filter((b) => typeof b.delay_ms === "number" && b.delay_ms >= THRESHOLDS.enRouteMinDelayMs).length;
    if (enRoute > THRESHOLDS.maxEnRouteBlocks) {
      emit(makeIssue(route, "too-many-en-route", gAt,
        `${enRoute} en-route blocks (delay_ms ≥ ${THRESHOLDS.enRouteMinDelayMs}) in this group; use at most ${THRESHOLDS.maxEnRouteBlocks}`,
        CITATIONS.enRoute));
    }

    group.blocks.forEach((b, i) => {
      const at: PathSegment[] = [...gAt, "blocks", i];
      const c = b.config;
      const t = types[i];

      // Wall of text: message blocks and hint text.
      const texts: { seg: PathSegment[]; text: string }[] = [];
      if (t === "message" && typeof c?.content === "string") texts.push({ seg: ["config", "content"], text: c.content });
      if (t === "question" && Array.isArray(c?.hints)) {
        c.hints.forEach((hint: unknown, h: number) => {
          if (!Array.isArray(hint)) return;
          hint.forEach((item: unknown, k: number) => {
            if (isObj(item) && typeof item.content === "string") {
              texts.push({ seg: ["config", "hints", h, k, "content"], text: item.content });
            }
          });
        });
      }
      for (const { seg, text } of texts) {
        const sentences = countSentences(text, language);
        const chars = text.trim().length;
        if (sentences > THRESHOLDS.maxSentences || chars > THRESHOLDS.maxMessageChars) {
          const what = sentences > THRESHOLDS.maxSentences
            ? `${sentences} sentences (max ${THRESHOLDS.maxSentences})`
            : `${chars} characters (max ~${THRESHOLDS.maxMessageChars})`;
          emit(makeIssue(route, "message-too-long", [...at, ...seg],
            `Wall of text: ${what}. Split it into several short blocks with delays`, CITATIONS.wallOfText));
        }
        const pun = owlPun(text);
        if (pun) {
          emit(makeIssue(route, "guide-pun", [...at, ...seg],
            `"${pun}" is an owl pun or cliché; the Owl is dry and never plays on its own name`, CITATIONS.owl));
        }
      }

      if (t === "question" && c) {
        // Accepted answers.
        if (Array.isArray(c.accepted_answers)) {
          const n = c.accepted_answers.length;
          if (n > 0 && n < THRESHOLDS.minAcceptedAnswers) {
            emit(makeIssue(route, "accepted-answer-count", [...at, "config", "accepted_answers"],
              "Only 1 accepted answer; add the short name and common alternatives (typically 2-4)",
              CITATIONS.acceptedAnswers));
          } else if (n > THRESHOLDS.maxAcceptedAnswers) {
            emit(makeIssue(route, "accepted-answer-count", [...at, "config", "accepted_answers"],
              `${n} accepted answers; typically 2-4 is enough (fuzzy matching covers typos, case and articles)`,
              CITATIONS.acceptedAnswers));
          }
        }

        // Duplicate success acknowledgement: the first message after the question.
        for (let j = i + 1; j < group.blocks.length; j++) {
          const tj = types[j];
          if (tj === "question" || tj === "action") break;
          if (tj !== "message") continue;
          const content = group.blocks[j].config?.content;
          const phrase = typeof content === "string" ? successOpener(content, language) : null;
          if (phrase) {
            emit(makeIssue(route, "duplicate-success-message", [...gAt, "blocks", j, "config", "content"],
              `Message opens with "${phrase}" right after a question; the success message is sent automatically from the message bank`,
              CITATIONS.duplicateSuccess));
          }
          break;
        }
      }

      if (t === "map" && typeof c?.google_maps_link === "string" && !MAP_LINK.test(c.google_maps_link.trim())) {
        emit(makeIssue(route, "map-link-format", [...at, "config", "google_maps_link"],
          "Map link should be https://maps.google.com/?q=Place+Name (location name, + for spaces)",
          CITATIONS.mapBlocks));
      }

      for (const ref of imageRefs(b)) {
        const slug = parseImagePlaceholder(ref.value.trim());
        if (!slug) continue;
        placeholders.push(slug);
        if (options.uploadedSlugs && !options.uploadedSlugs.has(slug)) {
          emit(makeIssue(route, "placeholder-not-uploaded", [...at, ...ref.seg],
            `No photo uploaded for {{IMAGE:${slug}}} (expected at route-images/${slug}.jpg); players see a grey placeholder tile`,
            CITATIONS.imageUrls));
        }
      }
    });
  });

  // routeSchema defaults is_active to true when it is omitted.
  const isActive = route.route?.is_active ?? true;
  if (isActive === true && placeholders.length > 0) {
    const unique = [...new Set(placeholders)];
    const implicit = route.route?.is_active === undefined ? " (is_active defaults to true when omitted)" : "";
    emit(makeIssue(route, "active-with-placeholders", ["route", "is_active"],
      `Route is active${implicit} but uses ${unique.length} image placeholder slug(s): ${unique.join(", ")}. Upload every slug before the route goes live`,
      CITATIONS.imageUrls));
  }
}
