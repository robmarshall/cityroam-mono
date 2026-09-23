import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintRoute, type LintResult, type RuleId } from "../index.js";
import { closing, hint, intro, msg, routeMeta } from "./fixtures.js";

/**
 * Every ```json example in the authoring docs must lint without errors, so a
 * doc edit that drifts from the schema or the linter fails here. Fragments
 * (block lists, lone configs, answer arrays, hints) are wrapped in a minimal
 * route before linting. The docs are read at test time, not copied.
 */

const DOCS = new URL("../../../../../docs/llm-authoring/", import.meta.url);

interface Fence {
  doc: string;
  line: number;
  /** Nearest "## " heading. */
  section: string;
  /** Nearest heading of any level. */
  heading: string;
  lang: string;
  body: string;
}

function fences(doc: string): Fence[] {
  const text = readFileSync(fileURLToPath(new URL(doc, DOCS)), "utf8").replace(/\r\n/g, "\n");
  const out: Fence[] = [];
  const lines = text.split("\n");
  let heading = "";
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) {
      heading = h[2].trim();
      if (h[1] === "##") section = heading;
    }
    const open = /^```(\w*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const start = i;
    const body: string[] = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    out.push({ doc, line: start + 1, section, heading, lang: open[1], body: body.join("\n") });
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isBlock = (v: unknown) => isObj(v) && typeof v.type === "string" && isObj(v.config);
const isSequenceItem = (v: unknown) => isObj(v) && "content" in v && "delay_ms" in v && !("type" in v);

/** Parses a fence body, accepting bare comma-separated objects and `"key": value` fragments. */
function parse(body: string): unknown {
  for (const candidate of [body, `[${body}]`, `{${body}}`]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next wrapping
    }
  }
  throw new Error("fence is not JSON, even as a fragment");
}

const fillerQuestion = () => ({
  type: "question",
  config: { type: "question", clue: "A riddle.", accepted_answers: ["A", "B"], hints: [hint("a"), hint("b")] },
  delay_ms: 0,
});

/**
 * A middle "location" group for a fragment. Fragments without a question
 * (intro messages, post-answer enrichment, en-route commentary) are the part
 * of a group that follows the riddle, so a filler question goes first.
 */
const stop = (blocks: unknown[]) => ({
  name: "Example stop",
  blocks: blocks.some((b) => isObj(b) && b.type === "question") ? blocks : [fillerQuestion(), ...blocks],
});

/**
 * api-reference.md's bulk example uses "uuid-of-existing-family" as a
 * stand-in for a real family id; the schema (rightly) rejects it, so it is
 * swapped for a well-formed UUID here rather than relaxing the linter.
 */
const DOC_ID_PLACEHOLDERS: Record<string, string> = {
  "uuid-of-existing-family": "00000000-0000-4000-8000-000000000000",
};

/** Turns a parsed fence into something lintRoute accepts, or null if it is not route content. */
function toRoute(value: unknown): { kind: string; input: unknown } | null {
  if (isObj(value) && isObj(value.route) && Array.isArray(value.groups)) {
    // A response body (server-assigned ids, "uuid" placeholders) is not authored content.
    if ("id" in value.route) return null;
    const familyId = value.route.route_family_id;
    if (typeof familyId === "string" && familyId in DOC_ID_PLACEHOLDERS) {
      return { kind: "route", input: { ...value, route: { ...value.route, route_family_id: DOC_ID_PLACEHOLDERS[familyId] } } };
    }
    return { kind: "route", input: value };
  }
  const wrap = (kind: string, blocks: unknown[]) => ({
    kind,
    input: { route: routeMeta(), groups: [intro(), stop(blocks), closing()] },
  });
  if (Array.isArray(value) && value.length > 0 && value.every(isBlock)) return wrap("blocks", value);
  if (isBlock(value)) return wrap("block", [value]);
  // A lone block config, e.g. translation-guide's `{ "type": "message", "content": … }`.
  if (isObj(value) && typeof value.type === "string" && !("config" in value) && !("language" in value)) {
    return wrap("config", [{ type: value.type, config: value, delay_ms: 0 }]);
  }
  if (isObj(value) && Array.isArray(value.accepted_answers)) {
    const q = {
      type: "question",
      config: { type: "question", clue: "A riddle.", accepted_answers: value.accepted_answers, hints: [hint("a"), hint("b")] },
      delay_ms: 0,
    };
    return wrap("accepted_answers", [q, msg("A fact.")]);
  }
  // A hint (SequenceItem[]) or a lone SequenceItem.
  const items = Array.isArray(value) ? value : [value];
  if (items.length > 0 && items.every(isSequenceItem)) {
    const q = {
      type: "question",
      config: { type: "question", clue: "A riddle.", accepted_answers: ["A", "B"], hints: [items, hint("b")] },
      delay_ms: 0,
    };
    return wrap("hint", [q, msg("A fact.")]);
  }
  return null;
}

const examples = [
  ...fences("content-guide.md"),
  ...fences("translation-guide.md"),
  ...fences("api-reference.md").filter((f) => f.heading.startsWith("Request Body")),
]
  .filter((f) => f.lang === "json")
  .map((f) => ({ ...f, route: toRoute(parse(f.body)) }))
  .filter((f): f is typeof f & { route: { kind: string; input: unknown } } => f.route !== null);

const label = (f: Fence & { route: { kind: string } }) =>
  `${f.doc}:${f.line} (${f.section}${f.heading !== f.section ? ` > ${f.heading}` : ""}, ${f.route.kind})`;
const rules = (r: LintResult) => r.warnings.map((w) => w.rule);

describe("authoring doc examples", () => {
  it("finds the examples (guards against the extraction silently matching nothing)", () => {
    const perDoc = (doc: string) => examples.filter((e) => e.doc === doc).length;
    expect(perDoc("content-guide.md")).toBeGreaterThanOrEqual(9);
    expect(perDoc("translation-guide.md")).toBeGreaterThanOrEqual(6);
    expect(perDoc("api-reference.md")).toBe(1);
    expect(examples.filter((e) => e.route.kind === "route").length).toBe(4);
  });

  it.each(examples.map((e) => [label(e), e] as const))("%s lints without errors", (_label, e) => {
    expect(lintRoute(e.route.input).errors).toEqual([]);
  });

  it.each(examples.filter((e) => !/^Bad Example/.test(e.heading)).map((e) => [label(e), e] as const))(
    "%s (a good example) triggers no content warnings",
    (_label, e) => {
      // The worked examples are marked is_active: true while still using
      // {{IMAGE:slug}} placeholders; that is the only warning they may carry.
      const allowed: RuleId[] = ["active-with-placeholders"];
      expect(rules(lintRoute(e.route.input)).filter((r) => !allowed.includes(r))).toEqual([]);
    },
  );

  it("flags the wall-of-text bad examples", () => {
    const bad = examples.filter(
      (e) =>
        e.doc === "content-guide.md" &&
        /^Bad Example/.test(e.heading) &&
        ["Post-Answer Enrichment", "En-Route Commentary"].includes(e.section),
    );
    expect(bad.length).toBe(2);
    for (const e of bad) expect(rules(lintRoute(e.route.input))).toContain("message-too-long");
  });

  it("accepts the documented map link format", () => {
    const fence = fences("content-guide.md").find((f) => f.body.startsWith("https://maps.google.com/"));
    expect(fence).toBeDefined();
    const input = {
      route: routeMeta(),
      groups: [intro(), stop([{ type: "map", config: { type: "map", google_maps_link: fence!.body.trim() }, delay_ms: 0 }]), closing()],
    };
    expect(rules(lintRoute(input))).not.toContain("map-link-format");
  });
});
