import { MAX_BLOCK_DELAY_MS, SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { z } from "zod";

/**
 * Transform-free wire shapes for the write tools' MCP `inputSchema`s.
 *
 * They mirror the shared schemas in `@cityroam/shared/validation`
 * (`routeSchema`, `routeBlockSchema`, `groupCreateSchema`, …) closely enough
 * that a client can render and pre-validate them, but carry no `preprocess`,
 * `transform`, `default` or `refine` — those do not survive JSON Schema
 * generation, and MCP clients read the schema literally. Every handler
 * re-parses its arguments with the real shared schema before any request, so
 * the shared schema stays the single source of truth for what the API accepts.
 */

export const languageEnum = z.enum(SUPPORTED_LANGUAGES as [SupportedLanguage, ...SupportedLanguage[]]);

export const id = (what: string) => z.string().min(1).describe(`${what} id (uuid)`);

const imageRef = z
  .string()
  .describe("An https URL or a {{IMAGE:slug}} placeholder (lowercase kebab-case slug)");

const sequenceItem = z.object({
  content: z.string().optional().describe("Hint text (may be empty when the step is only an image)"),
  image_url: imageRef.nullable().optional(),
  delay_ms: z.number().int().min(0).max(10_000).optional().describe("Pause before this step, 0-10000 ms"),
});

const messageConfig = z.object({
  type: z.literal("message"),
  content: z.string().min(1).describe("What the guide says. Supports {{CITY_NAME}}-style template variables."),
});

const imageConfig = z.object({
  type: z.literal("image"),
  image_url: imageRef,
});

const questionConfig = z.object({
  type: z.literal("question"),
  clue: z.string().min(1),
  accepted_answers: z.array(z.string().min(1)).min(1),
  hints: z
    .array(z.array(sequenceItem))
    .min(2)
    .max(3)
    .describe("2-3 hints, each a sequence of steps shown in order"),
});

const actionConfig = z.object({
  type: z.literal("action"),
  label: z.string().min(1).describe("Button label the player presses"),
});

const mapConfig = z.object({
  type: z.literal("map"),
  google_maps_link: z.string().describe("A Google Maps URL"),
});

export const blockTypeEnum = z.enum(["message", "image", "question", "action", "map"]);

export const blockConfig = z
  .discriminatedUnion("type", [messageConfig, imageConfig, questionConfig, actionConfig, mapConfig])
  .describe("Block content; config.type must equal the block type");

/** Mirrors `routeBlockSchema` minus `position` (tools take position separately). */
export const blockInput = z.object({
  type: blockTypeEnum,
  config: blockConfig,
  delay_ms: z
    .number()
    .int()
    .min(0)
    .max(MAX_BLOCK_DELAY_MS)
    .optional()
    .describe(`Pause before the block, 0-${MAX_BLOCK_DELAY_MS} ms (default 0)`),
});

/** Mirrors `routeGroupSchema`. */
export const groupInput = z.object({
  name: z.string().min(1).max(100),
  blocks: z.array(blockInput).min(1).max(50),
});

/** Mirrors `routeSchema` without `is_active`: activation is human-only. */
export const routeInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  language: languageEnum,
  route_family_id: z
    .string()
    .optional()
    .describe("Add this route as a language variant of an existing family. Give this or city."),
  city: z.string().min(1).optional().describe("Creates a new route family in this city. Give this or route_family_id."),
  estimated_duration_mins: z.number().positive().max(1440),
  estimated_distance_km: z.number().positive().max(100),
});

export const routePatch = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().describe('New description ("" clears it)'),
  estimated_duration_mins: z.number().positive().max(1440).optional(),
  estimated_distance_km: z.number().positive().max(100).optional(),
});

const dryRun = z
  .boolean()
  .optional()
  .describe("Validate and show the exact request and the change it would make, without writing anything");

const confirmLive = z
  .boolean()
  .optional()
  .describe("Required (true) when the route is ACTIVE (on sale): acknowledges that players may see the change");

const confirm = z.literal(true).describe("Must be true: deletes cannot be undone");

const routeHint = z
  .string()
  .optional()
  .describe("Optional: the route containing it. Saves a lookup across all routes.");

const position = (what: string) =>
  z.number().int().min(0).optional().describe(`0-based ${what} position (default: append at the end)`);

export const writeToolInputShapes = {
  create_route: {
    route: routeInput,
    groups: z.array(groupInput).min(1).max(30),
    force: z.boolean().optional().describe("Create even when validate_route reports errors (not recommended)"),
    dry_run: dryRun.describe("Ask the API to run the whole create in a rolled-back transaction"),
  },
  update_route: {
    route_id: id("Route"),
    patch: routePatch.describe("Fields to change; everything else keeps its current value"),
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  add_group: {
    route_id: id("Route"),
    name: z.string().min(1).max(100),
    blocks: z.array(blockInput).max(50).optional(),
    position: position("group"),
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  update_group: {
    route_id: id("Route"),
    group_id: id("Group"),
    name: z.string().min(1).max(100),
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  delete_group: {
    route_id: id("Route"),
    group_id: id("Group"),
    confirm,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  add_block: {
    group_id: id("Group"),
    block: blockInput,
    position: position("block"),
    route_id: routeHint,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  update_block: {
    block_id: id("Block"),
    block: blockInput.describe("The complete new block (replaces type, config and delay_ms)"),
    route_id: routeHint,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  patch_block_config: {
    block_id: id("Block"),
    config_patch: z
      .record(z.string(), z.unknown())
      .describe(
        "Fields to deep-merge into the current config. Objects merge key by key; arrays (accepted_answers, hints) and scalars replace the current value.",
      ),
    route_id: routeHint,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  move_block: {
    block_id: id("Block"),
    target_group_id: id("Target group"),
    position: z.number().int().min(0).describe("0-based position in the target group (clamped to the end)"),
    route_id: routeHint,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  delete_block: {
    block_id: id("Block"),
    confirm,
    route_id: routeHint,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  reorder_groups: {
    route_id: id("Route"),
    group_ids: z.array(z.string()).min(1).describe("Every group id of the route, in the new order"),
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
  reorder_blocks: {
    group_id: id("Group"),
    block_ids: z.array(z.string()).min(1).describe("Every block id of the group, in the new order"),
    route_id: routeHint,
    confirm_live: confirmLive,
    dry_run: dryRun,
  },
} as const;
