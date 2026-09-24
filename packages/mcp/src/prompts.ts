import { readFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult, PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { SUPPORTED_LANGUAGES, guideNameFor } from "@cityroam/shared/constants";
import { z } from "zod";
import type { Config } from "./config.js";
import { DOC_RESOURCES, docUri, type DocName } from "./resources.js";

/**
 * Prompts: `author_route` and `translate_route`. Each returns a workflow
 * message plus the relevant `cityroam://docs/*` files as embedded resources
 * (read at request time from CITYROAM_DOCS_DIR). A doc that cannot be read is
 * sent as a resource link instead, so the prompt still works and the model can
 * fetch it later.
 *
 * MCP prompt arguments are always strings, so `stops` is parsed here.
 */

export const AUTHORING_DOCS: readonly DocName[] = ["api-reference", "content-guide", "guide-personality", "data-model"];

const languageList = SUPPORTED_LANGUAGES.join(", ");

export const promptArgShapes = {
  author_route: {
    city: z.string().min(1).describe("City the route is in, e.g. Leeds"),
    theme: z.string().optional().describe("Optional theme or angle, e.g. 'Victorian industry' or 'hidden history'"),
    stops: z.string().optional().describe("Optional number of stops (question groups), e.g. 8"),
    language: z.string().optional().describe(`Optional route language: one of ${languageList}. Defaults to en.`),
  },
  translate_route: {
    route_id: z.string().min(1).describe("Id of the source route to translate"),
    target_language: z.string().min(1).describe(`Target language: one of ${languageList}`),
  },
} as const;

async function docMessage(config: Config, name: DocName): Promise<PromptMessage> {
  const uri = docUri(name);
  try {
    const text = await readFile(path.join(config.docsDir, `${name}.md`), "utf8");
    return { role: "user", content: { type: "resource", resource: { uri, mimeType: "text/markdown", text } } };
  } catch {
    return {
      role: "user",
      content: { type: "resource_link", uri, name: `${name}.md`, mimeType: "text/markdown", description: DOC_RESOURCES[name] },
    };
  }
}

function parseLanguage(value: string | undefined, fallback: string | undefined, argName: string): string {
  const lang = value?.trim().toLowerCase() || fallback;
  if (!lang || !(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    throw new Error(`${argName} must be one of ${languageList} (got "${value ?? ""}").`);
  }
  return lang;
}

function parseStops(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error(`stops must be a whole number from 1 to 50 (got "${value}").`);
  return n;
}

function envLine(config: Config): string {
  return config.env === "production"
    ? `This server is pinned to PRODUCTION (${config.apiUrl}). Only write here because the user explicitly asked for production.`
    : `This server is pinned to ${config.env} (${config.apiUrl}).`;
}

export function authorRouteText(
  config: Config,
  args: { city: string; theme?: string; stops?: number; language: string },
): string {
  const theme = args.theme?.trim() ? ` with the theme "${args.theme.trim()}"` : "";
  const stops = args.stops ? `${args.stops} stops` : "a sensible number of stops (usually 6–10)";
  return [
    `Author a new City Roam treasure hunt route in ${args.city}${theme}, with ${stops}, in language "${args.language}".`,
    envLine(config),
    "",
    `The four authoring docs are attached below (${AUTHORING_DOCS.map((d) => docUri(d)).join(", ")}). Read all of them before drafting: they define the block types, the guide's voice, hint and answer rules, and the bulk payload format.`,
    "",
    "Workflow — follow it in order:",
    `1. Research: pick real, publicly accessible locations in ${args.city} that make a walkable loop, and check facts (names, dates, inscriptions) so every clue can be answered on site. Use list_route_families with city "${args.city}" to see whether a family already exists; if a route in this language exists there, stop and ask the user whether to edit it instead.`,
    "2. Draft the full bulk payload ({ route, groups }) following content-guide.md and guide-personality.md: an introduction group, one group per stop (directions, clue, hints, fun fact), and a closing group. Use {{IMAGE:slug}} placeholders for photos rather than raw URLs.",
    `   The guide is the Owl (in this language: "${guideNameFor(args.language).label}"). It introduces itself once, in the introduction group, with the {{GUIDE_NAME}} template variable ("I'm {{GUIDE_NAME}}.") — never hard-code the name. At most one owl reference in the whole route, and no owl puns (guide-personality.md > The Owl).`,
    "3. validate_route with { payload } and fix every error. Treat warnings seriously; explain any you deliberately leave.",
    "4. create_route with dry_run: true. It validates on the API and rolls back; fix anything it reports.",
    "5. create_route for real. Show the user the returned route id and compact tree.",
    "6. list_image_slugs for the new route to see which placeholders still have no photo in this environment.",
    "7. upload_image for each missing slug, but only from files or URLs the user has provided or approved (local files must be inside CITYROAM_IMAGE_ROOTS). Slug images must be JPEG.",
    "",
    "Rules:",
    "- Routes are always created inactive (is_active is forced to false). You cannot activate a route: a human reviews it and activates it in the admin UI. Tell the user this when you finish.",
    "- Use dry_run before any write you are unsure about. Deletes need confirm: true; changes to an active route need confirm_live: true — ask the user before using either.",
    "- Never switch environments or target production unless the user explicitly says so.",
  ].join("\n");
}

export function translateRouteText(config: Config, args: { route_id: string; target_language: string }): string {
  return [
    `Translate City Roam route ${args.route_id} into "${args.target_language}" as a new sibling language variant in the same route family.`,
    envLine(config),
    "",
    `translation-guide.md is attached below (${docUri("translation-guide")}); follow it exactly. content-guide and guide-personality are linked for tone and structure.`,
    "",
    "Workflow — follow it in order:",
    `1. get_route with route_id "${args.route_id}" and format "tree" to read the source route in full (language, route_family_id, every group and block).`,
    `2. get_route_family for that route_family_id. If a "${args.target_language}" route already exists in the family, do not create a duplicate: stop and offer to edit that route instead.`,
    `3. Draft the translated bulk payload: route.language "${args.target_language}", route.route_family_id set to the source family (no city), translated name and description, the same groups and blocks in the same order. Keep template variables ({{CITY_NAME}}, {{TOTAL_STOPS}}, {{GUIDE_NAME}}, …), {{IMAGE:slug}} placeholders, map links and delay_ms unchanged; translate accepted answers as the guide describes (keep proper nouns, add local-language variants).`,
    `   The guide is the Owl; in "${args.target_language}" {{GUIDE_NAME}} becomes "${guideNameFor(args.target_language).inSentence}" (capitalised automatically at the start of a sentence). Keep the variable where the source has it (the intro's "I'm {{GUIDE_NAME}}."), make first-person lines agree with the name's grammatical gender (translation-guide.md > The Guide's Name), and never add or translate an owl pun.`,
    "4. validate_route with { payload } and fix every error.",
    "5. create_route with dry_run: true, then create_route for real.",
    `6. list_message_banks with language "${args.target_language}". If a message bank type has no active entries in that language, draft them following the guide and add them with create_message_bank_entry (dry_run first).`,
    "7. list_image_slugs for the new route: the placeholders are shared with the source route, so the photos should already exist in this environment.",
    "",
    "Rules:",
    "- The new route is created inactive. A human reviews it and activates it in the admin UI; you cannot.",
    "- Do not edit the source route. Deletes need confirm: true and changes to an active route need confirm_live: true — ask the user before using either.",
    "- Never switch environments or target production unless the user explicitly says so.",
  ].join("\n");
}

function textMessage(text: string): PromptMessage {
  return { role: "user", content: { type: "text", text } };
}

export function registerPrompts(server: McpServer, config: Config): void {
  server.registerPrompt(
    "author_route",
    {
      title: "Author a route",
      description:
        "Research, draft, validate and create a new inactive route in a city, with the four authoring docs attached.",
      argsSchema: promptArgShapes.author_route,
    },
    async (args): Promise<GetPromptResult> => {
      const language = parseLanguage(args.language, "en", "language");
      const stops = parseStops(args.stops);
      const text = authorRouteText(config, { city: args.city.trim(), theme: args.theme, stops, language });
      const docs = await Promise.all(AUTHORING_DOCS.map((name) => docMessage(config, name)));
      return { description: `Author a route in ${args.city.trim()}`, messages: [textMessage(text), ...docs] };
    },
  );

  server.registerPrompt(
    "translate_route",
    {
      title: "Translate a route",
      description:
        "Translate an existing route into another language as an inactive sibling variant in the same family, following translation-guide.md.",
      argsSchema: promptArgShapes.translate_route,
    },
    async (args): Promise<GetPromptResult> => {
      const target = parseLanguage(args.target_language, undefined, "target_language");
      const routeId = args.route_id.trim();
      const text = translateRouteText(config, { route_id: routeId, target_language: target });
      const guide = await docMessage(config, "translation-guide");
      const links: PromptMessage[] = (["content-guide", "guide-personality"] as const).map((name) => ({
        role: "user",
        content: { type: "resource_link", uri: docUri(name), name: `${name}.md`, mimeType: "text/markdown", description: DOC_RESOURCES[name] },
      }));
      return { description: `Translate route ${routeId} into ${target}`, messages: [textMessage(text), guide, ...links] };
    },
  );
}
