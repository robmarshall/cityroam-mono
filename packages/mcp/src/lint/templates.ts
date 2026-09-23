/**
 * Template-variable checks for player-facing text.
 *
 * The API substitutes `{{KEY}}` tokens by exact string replacement
 * (packages/api/src/services/template-vars.ts `applyTemplateVars`), and only in
 * message block `content` (group-runner) and hint text (hint-request
 * `sendSequence`). The keys it provides are those of `buildRouteTemplateVars`,
 * which content-guide.md > Template Variables in Message Blocks documents.
 * `{{IMAGE:slug}}` is resolved only in `image_url` fields (and validated there
 * by the shared schema), and `{{ANSWER}}` only in hint-exhausted message-bank
 * templates. Anything else is shown to players literally.
 */

export const ROUTE_TEMPLATE_VARIABLES = [
  "CITY_NAME",
  "TOTAL_STOPS",
  "DISTANCE_KM",
  "REVIEW_LINK",
] as const;

export interface TemplateProblem {
  rule: "template-malformed" | "template-unknown";
  message: string;
}

const TOKEN = /\{\{([^{}]*)\}\}/g;
const SINGLE_BRACE = /(?<!\{)\{\s*([A-Za-z][A-Za-z0-9_:-]*)\s*\}(?!\})/g;

/**
 * @param allowed the keys substituted in this field (empty: none are).
 * @param field human description of the field, for messages.
 */
export function templateProblems(
  text: string,
  allowed: readonly string[],
  field: string,
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const allowedList = allowed.map((k) => `{{${k}}}`).join(", ");

  for (const match of text.matchAll(TOKEN)) {
    const token = match[0];
    const inner = match[1];

    if (/^[A-Z][A-Z0-9_]*$/.test(inner)) {
      if (allowed.includes(inner)) continue;
      let why: string;
      if (allowed.length === 0) {
        why = `template variables are not substituted in ${field} (only in message block content and hint text), so players would see it literally`;
      } else if (inner === "ANSWER") {
        why = `{{ANSWER}} only works in hint-exhausted message-bank templates; allowed here: ${allowedList}`;
      } else {
        why = `allowed in ${field}: ${allowedList}`;
      }
      problems.push({ rule: "template-unknown", message: `Unknown template variable ${token} — ${why}` });
      continue;
    }

    if (/^IMAGE:/.test(inner)) {
      problems.push({
        rule: "template-unknown",
        message: `${token} in ${field}: image placeholders only resolve in an image_url field (image block or hint image)`,
      });
      continue;
    }

    const suggestion = inner.trim().toUpperCase();
    const hint = allowed.includes(suggestion) ? ` — did you mean {{${suggestion}}}?` : "";
    problems.push({
      rule: "template-malformed",
      message: `Malformed template ${token} in ${field}: tokens must be exactly {{NAME}} (uppercase, no spaces)${hint}`,
    });
  }

  const rest = text.replace(TOKEN, "");
  if (rest.includes("{{") || rest.includes("}}")) {
    problems.push({
      rule: "template-malformed",
      message: `Unbalanced "{{" or "}}" in ${field}`,
    });
  }

  for (const match of rest.matchAll(SINGLE_BRACE)) {
    const name = match[1];
    const upper = name.toUpperCase();
    if (/^[A-Z][A-Z0-9_]*$/.test(name) || allowed.includes(upper) || name.startsWith("IMAGE:")) {
      problems.push({
        rule: "template-malformed",
        message: `Malformed template ${match[0]} in ${field}: template variables need double braces, e.g. {{${upper}}}`,
      });
    }
  }

  return problems;
}
