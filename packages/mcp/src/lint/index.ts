import { normalize } from "./normalize.js";
import { errorRules, warningRules } from "./rules.js";
import { schemaIssues } from "./schema.js";
import type { Issue, LintOptions, LintResult } from "./types.js";

export type { Issue, LintOptions, LintResult, RuleId } from "./types.js";
export { THRESHOLDS } from "./rules.js";
export { ROUTE_TEMPLATE_VARIABLES } from "./templates.js";
export { CITATIONS } from "./citations.js";

/**
 * Lints a route against the shared Zod schemas and the content guide
 * (docs/llm-authoring/content-guide.md).
 *
 * Accepts either the `POST /admin/routes/bulk-groups` body or the
 * `GET /admin/routes/:id` response. Errors mean the API would reject the
 * payload or players would see broken content; warnings are content-guide
 * advice. Pure: no I/O.
 */
export function lintRoute(input: unknown, options: LintOptions = {}): LintResult {
  const route = normalize(input);
  const errors: Issue[] = [...schemaIssues(route)];
  const warnings: Issue[] = [];
  errorRules(route, (i) => errors.push(i));
  warningRules(route, options, (i) => warnings.push(i));
  return { errors, warnings };
}
