import type { NormalizedRoute } from "./normalize.js";
import type { Issue, RuleId } from "./types.js";

export type PathSegment = string | number;

/** `["groups", 2, "blocks", 4, "config"]` → `groups[2].blocks[4].config`. */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = "";
  for (const seg of segments) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out;
}

/** Builds an Issue, filling group_name / block_id from the path. */
export function makeIssue(
  route: NormalizedRoute,
  rule: RuleId,
  segments: readonly PathSegment[],
  message: string,
  citation: string,
): Issue {
  const issue: Issue = { rule, message, path: formatPath(segments), citation };
  if (segments[0] === "groups" && typeof segments[1] === "number") {
    const group = route.groups[segments[1]];
    if (group?.name) issue.group_name = group.name;
    if (segments[2] === "blocks" && typeof segments[3] === "number") {
      const block = group?.blocks[segments[3]];
      if (block?.id) issue.block_id = block.id;
    }
  }
  return issue;
}
