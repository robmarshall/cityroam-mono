import { bulkRouteGroupCreateSchema } from "@cityroam/shared/validation";
import { CITATIONS } from "./citations.js";
import { makeIssue, type PathSegment } from "./issue.js";
import type { NormalizedRoute } from "./normalize.js";
import type { Issue, RuleId } from "./types.js";

/** routeBlockSchema's refine message; block-type-mismatch reports this itself. */
const TYPE_MISMATCH_MESSAGE = "Block type must match config type";

function segmentsOf(path: readonly PropertyKey[]): PathSegment[] {
  return path.map((p) => (typeof p === "number" ? p : String(p)));
}

function isGroupsPath(s: PathSegment[]): boolean {
  return s.length === 1 && s[0] === "groups";
}

function isBlocksPath(s: PathSegment[]): boolean {
  return s.length === 3 && s[0] === "groups" && typeof s[1] === "number" && s[2] === "blocks";
}

function isHintsPath(s: PathSegment[]): boolean {
  return s.length === 6 && s[2] === "blocks" && s[4] === "config" && s[5] === "hints";
}

function citationFor(s: PathSegment[]): string {
  if (s.includes("image_url")) return CITATIONS.imageUrls;
  if (s.includes("delay_ms") && s.includes("hints")) return CITATIONS.hints;
  if (s.includes("delay_ms")) return CITATIONS.delays;
  if (s.includes("blocks")) return CITATIONS.blockTypes;
  return CITATIONS.schema;
}

/**
 * Runs the real shared bulk-create schema and maps every Zod issue to a lint
 * error. Hint-count and group/block-limit failures get their own rule ids so a
 * caller can tell them apart from generic shape errors.
 */
export function schemaIssues(route: NormalizedRoute): Issue[] {
  const result = bulkRouteGroupCreateSchema.safeParse(route.payload);
  if (result.success) return [];

  const issues: Issue[] = [];
  for (const zi of result.error.issues) {
    if (zi.message === TYPE_MISMATCH_MESSAGE) continue;
    const s = segmentsOf(zi.path);
    let rule: RuleId = "schema";
    let citation = citationFor(s);
    let message = zi.message;

    if (isHintsPath(s) && (zi.code === "too_small" || zi.code === "too_big")) {
      rule = "hint-count";
      citation = CITATIONS.hints;
      const cfg = route.groups[s[1] as number]?.blocks[s[3] as number]?.config;
      const n = Array.isArray(cfg?.hints) ? cfg.hints.length : "?";
      message = `Question has ${n} hint(s); each question block must have 2-3 hints`;
    } else if (isGroupsPath(s) && zi.code === "too_big") {
      rule = "max-groups";
      citation = CITATIONS.limits;
      message = `Route has ${route.groups.length} groups; the maximum is ${String(zi.maximum)}`;
    } else if (isBlocksPath(s) && zi.code === "too_big") {
      rule = "max-blocks";
      citation = CITATIONS.limits;
      const n = route.groups[s[1] as number]?.blocks.length ?? "?";
      message = `Group has ${n} blocks; the maximum is ${String(zi.maximum)} per group`;
    } else if ((isGroupsPath(s) || isBlocksPath(s)) && zi.code === "too_small") {
      citation = CITATIONS.limits;
    }

    issues.push(makeIssue(route, rule, s, message, citation));
  }
  return issues;
}
