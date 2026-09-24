/**
 * Route content linter types. The linter is pure: no I/O, no MCP dependency.
 */

export type RuleId =
  // Errors — block writes unless forced.
  | "schema"
  | "block-type-mismatch"
  | "hint-count"
  | "max-groups"
  | "max-blocks"
  | "template-malformed"
  | "template-unknown"
  // Warnings — content-guide advice.
  | "first-group-question"
  | "group-missing-question"
  | "image-before-question"
  | "too-many-images"
  | "message-too-long"
  | "delay-free-run"
  | "duplicate-success-message"
  | "too-many-en-route"
  | "accepted-answer-count"
  | "map-link-format"
  | "active-with-placeholders"
  | "placeholder-not-uploaded"
  | "guide-pun";

export interface Issue {
  rule: RuleId;
  message: string;
  /** Location in the (bulk-shaped) route, e.g. `groups[2].blocks[4].config.hints`. */
  path: string;
  group_name?: string;
  /** Present when linting a stored route (admin GET shape), whose blocks have ids. */
  block_id?: string;
  /** The doc section (or schema) the rule comes from. */
  citation: string;
}

export interface LintResult {
  errors: Issue[];
  warnings: Issue[];
}

export interface LintOptions {
  /**
   * Slugs that already have a photo at `route-images/<slug>.jpg`. When given,
   * every `{{IMAGE:slug}}` whose slug is missing from the set is a warning.
   */
  uploadedSlugs?: Set<string>;
}
