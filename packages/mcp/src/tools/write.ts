import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type {
  AdminBulkRouteCreateResponse,
  AdminBulkRouteDryRunResponse,
  AdminGroupCreateResponse,
  AdminRouteDetailResponse,
  AdminRouteListResponse,
} from "@cityroam/shared/types";
import {
  blockMoveSchema,
  blockReorderSchema,
  bulkRouteGroupCreateSchema,
  groupCreateSchema,
  groupReorderSchema,
  groupUpdateSchema,
  routeBlockSchema,
  routeSchema,
} from "@cityroam/shared/validation";
import { ApiError, type HttpClient, type Query } from "../client/http.js";
import type { CityRoamEnv } from "../config.js";
import { blockText, formatLintResult, formatRouteCompact, preview } from "../format.js";
import { lintRoute } from "../lint/index.js";
import { apiErrorResult, errorResult, guard, okResult } from "../result.js";
import type { ToolContext } from "./context.js";
import { writeToolInputShapes } from "./wire-schemas.js";

/**
 * Write tools. Each one:
 *
 * 1. re-parses its arguments with the real shared schema (the wire shapes in
 *    wire-schemas.ts are only a rendering aid) — a payload the API would
 *    reject fails here, before any request;
 * 2. GETs the route it touches, to check the ids exist and whether the route
 *    is ACTIVE (on sale) — an active route needs `confirm_live: true`;
 * 3. with `dry_run`, returns the exact request and a readable diff and sends
 *    nothing but GETs (create_route instead asks the API for a rolled-back
 *    run, `?dry_run=true`);
 * 4. otherwise sends the request, then re-fetches the route and returns its
 *    compact tree so the caller sees the new ids and positions.
 */

type Detail = AdminRouteDetailResponse;
type Group = Detail["groups"][number];
type Block = Group["blocks"][number];
type Method = "POST" | "PUT" | "DELETE";

const CREATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const UPDATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const DELETE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

const enc = encodeURIComponent;

// ── Errors ──────────────────────────────────────────────────────────────

const LIVE_GUARD_GUIDANCE =
  "Players are part-way through this route, so the API refuses changes that shift positions " +
  "(mid-sequence inserts, moves, deletes, block reorders). Still allowed: editing content in place " +
  "(update_block, patch_block_config, update_group) and appending (add_block / add_group without a position). " +
  "Otherwise wait until the live events finish.";

/** Extra guidance for API error codes the model can act on. */
export const ERROR_GUIDANCE: Record<string, string> = {
  GROUP_HAS_LIVE_EVENTS: LIVE_GUARD_GUIDANCE,
  BLOCK_HAS_LIVE_EVENTS: LIVE_GUARD_GUIDANCE,
  ADMIN_SCOPE_REQUIRED:
    "The API key is valid but lacks the scope named above. Activating a route (making it ACTIVE / on sale) is " +
    "human-only: a person does it in the admin panel, and no API key can hold that scope. For any other scope, " +
    "ask the owner to issue a key that includes it.",
  ADMIN_SESSION_REQUIRED:
    "This endpoint is only available to a signed-in admin in the admin panel, never to an API key.",
  ADMIN_UNAUTHORIZED:
    "The API key was rejected (unknown, revoked, expired, or issued for another environment). Ask the owner for a new key.",
  DUPLICATE_LANGUAGE_VARIANT:
    "The family already has an active route in this language. Create this one inactive (the MCP server always does) " +
    "or use another family.",
};

function writeGuard(env: CityRoamEnv, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  return guard(env, async () => {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      const result = apiErrorResult(env, err);
      const extra = [ERROR_GUIDANCE[err.code]];
      if (err.status >= 400 && err.status < 500) extra.push("Nothing was changed.");
      const text = extra.filter(Boolean).join("\n");
      if (text && result.content[0]?.type === "text") result.content[0].text += `\n${text}`;
      return result;
    }
  });
}

/** Local failure shaped like an API error (`Error CODE: message`), without an HTTP status. */
function localError(code: string, message: string): ApiError {
  return new ApiError(0, code, message);
}

function zodMessage(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Parses with a shared schema; a failure becomes a local INVALID_INPUT error (no request sent). */
function parseShared<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw localError("INVALID_INPUT", `${zodMessage(result.error)} (checked locally with the shared schema; nothing was sent)`);
  }
  return result.data;
}

// ── Route lookup ────────────────────────────────────────────────────────

/**
 * Finds the route that holds a group or block. The admin API has no
 * block→route or group→route lookup, so without a `route_id` hint this lists
 * the routes (newest first) and fetches each until it finds the id. Details
 * are cached for the duration of one tool call only.
 */
export class RouteLocator {
  private readonly details = new Map<string, Detail>();
  private routeIds?: string[];

  constructor(private readonly http: HttpClient) {}

  async route(routeId: string): Promise<Detail> {
    const cached = this.details.get(routeId);
    if (cached) return cached;
    const { data } = await this.http.get<Detail>(`/admin/routes/${enc(routeId)}`);
    this.details.set(routeId, data);
    return data;
  }

  private async find<T>(
    hint: string | undefined,
    pick: (d: Detail) => T | undefined,
    code: string,
    what: string,
  ): Promise<{ detail: Detail; found: T }> {
    if (hint) {
      const detail = await this.route(hint);
      const found = pick(detail);
      if (found === undefined) throw localError(code, `${what} is not in route ${hint} ("${detail.route.name}").`);
      return { detail, found };
    }
    for (const detail of this.details.values()) {
      const found = pick(detail);
      if (found !== undefined) return { detail, found };
    }
    if (!this.routeIds) {
      const { data } = await this.http.get<AdminRouteListResponse>("/admin/routes");
      this.routeIds = data.routes.map((r) => r.id);
    }
    for (const routeId of this.routeIds) {
      if (this.details.has(routeId)) continue;
      const detail = await this.route(routeId);
      const found = pick(detail);
      if (found !== undefined) return { detail, found };
    }
    throw localError(code, `${what} was not found in any route.`);
  }

  findGroup(groupId: string, hint?: string): Promise<{ detail: Detail; found: Group }> {
    return this.find(hint, (d) => d.groups.find((g) => g.id === groupId), "GROUP_NOT_FOUND", `Group ${groupId}`);
  }

  findBlock(blockId: string, hint?: string): Promise<{ detail: Detail; found: { group: Group; block: Block } }> {
    return this.find(
      hint,
      (d) => {
        for (const group of d.groups) {
          const block = group.blocks.find((b) => b.id === blockId);
          if (block) return { group, block };
        }
        return undefined;
      },
      "BLOCK_NOT_FOUND",
      `Block ${blockId}`,
    );
  }
}

// ── Diffs ───────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function show(v: unknown): string {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : preview(s, 120);
}

/** Readable field-level diff: `~ path: old → new`, `+ path: new`, `- path: old`. */
export function diffValues(before: unknown, after: unknown, path = ""): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const at = (key: string | number) =>
    typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key;
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((k) => {
      if (!(k in after)) return [`- ${at(k)}: ${show(before[k])}`];
      if (!(k in before)) return [`+ ${at(k)}: ${show(after[k])}`];
      return diffValues(before[k], after[k], at(k));
    });
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const lines: string[] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if (i >= after.length) lines.push(`- ${at(i)}: ${show(before[i])}`);
      else if (i >= before.length) lines.push(`+ ${at(i)}: ${show(after[i])}`);
      else lines.push(...diffValues(before[i], after[i], at(i)));
    }
    return lines;
  }
  return [`~ ${path || "(value)"}: ${show(before)} → ${show(after)}`];
}

/**
 * Deep-merges `patch` into `base`: plain objects merge key by key; arrays
 * and scalars (including null) replace the base value.
 */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return structuredClone(patch);
  const out: Record<string, unknown> = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(base[k], v);
  return out;
}

function blockLine(block: Pick<Block, "type" | "config">): string {
  return `${block.type} | ${preview(blockText(block))}`;
}

function groupLabel(g: Group): string {
  return `group ${g.position} "${g.name}" (${g.id})`;
}

// ── Plan / execute ──────────────────────────────────────────────────────

interface Plan<T> {
  method: Method;
  path: string;
  query?: Query;
  body?: unknown;
  /** The route to re-fetch afterwards. */
  routeId: string;
  /** Readable description of what changes, one line per change. */
  changes: string[];
  /** First line of the success text, built from the API response. */
  summary: (data: T) => string;
}

/**
 * Active routes are on sale: a change needs `confirm_live: true`. A dry run
 * is never blocked but says what the real call will need.
 */
function liveGate(env: CityRoamEnv, detail: Detail, confirmLive: boolean | undefined, dryRun: boolean | undefined) {
  if (!detail.route.is_active || confirmLive) return { note: undefined, blocked: undefined };
  const note = `Route "${detail.route.name}" is ACTIVE (on sale); the real call needs confirm_live: true.`;
  if (dryRun) return { note, blocked: undefined };
  return {
    note,
    blocked: errorResult(
      env,
      `Error CONFIRM_LIVE_REQUIRED: route "${detail.route.name}" id=${detail.route.id} is ACTIVE — it is on sale and ` +
        "players may be playing it, so they can see this change. Re-run with confirm_live: true to go ahead, or " +
        "dry_run: true to preview. Nothing was sent.",
    ),
  };
}

async function execute<T>(
  ctx: ToolContext,
  plan: Plan<T>,
  options: { dryRun?: boolean; note?: string; structured?: Record<string, unknown> } = {},
): Promise<CallToolResult> {
  const { config, http } = ctx;
  const env = config.env;
  const request = { method: plan.method, path: plan.path, ...(plan.query ? { query: plan.query } : {}), ...(plan.body !== undefined ? { body: plan.body } : {}) };

  if (options.dryRun) {
    const qs = plan.query ? `?${new URLSearchParams(plan.query as Record<string, string>).toString()}` : "";
    const lines = ["Dry run — nothing was sent."];
    if (options.note) lines.push(options.note);
    lines.push(`Would send: ${plan.method} ${plan.path}${qs}`);
    if (plan.body !== undefined) lines.push(`Body: ${JSON.stringify(plan.body, null, 2)}`);
    lines.push("Changes:", ...(plan.changes.length ? plan.changes.map((c) => `  ${c}`) : ["  (none — the request would not change anything)"]));
    return okResult(env, lines.join("\n"), { structured: { dry_run: true, request, changes: plan.changes } });
  }

  const response = await http.request<T>(plan.method, plan.path, { body: plan.body, query: plan.query });
  return finish(ctx, plan.routeId, plan.summary(response.data), response.liveEvents, {
    ...options.structured,
    changes: plan.changes,
  });
}

/** Re-fetches the route after a successful write and renders its compact tree. */
async function finish(
  ctx: ToolContext,
  routeId: string,
  summary: string,
  liveEvents: number | undefined,
  structured: Record<string, unknown> = {},
): Promise<CallToolResult> {
  let tree: string;
  try {
    const { data } = await ctx.http.get<Detail>(`/admin/routes/${enc(routeId)}`);
    tree = formatRouteCompact(data);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    tree = `(The write succeeded, but re-fetching route ${routeId} failed: ${reason}. Call get_route to see it.)`;
  }
  return okResult(ctx.config.env, `${summary}\n\n${tree}`, {
    liveEvents,
    structured: { route_id: routeId, live_events: liveEvents ?? 0, ...structured },
  });
}

// ── Tools ───────────────────────────────────────────────────────────────

export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  const { config, http } = ctx;
  const env = config.env;
  const shapes = writeToolInputShapes;
  const locator = () => new RouteLocator(http);

  server.registerTool(
    "create_route",
    {
      title: "Create route",
      description:
        "Create a complete route (metadata, groups and blocks) in one call via POST /admin/routes/bulk-groups. " +
        "The route is always created INACTIVE — activation is done by a human in the admin panel. The draft is " +
        "linted first (as validate_route): errors block unless force is true, warnings are returned with the result. " +
        "dry_run asks the API to run the whole create in a rolled-back transaction.",
      inputSchema: shapes.create_route,
      annotations: CREATE,
    },
    ({ route, groups, force, dry_run }) =>
      writeGuard(env, async () => {
        // Activation is human-only: never let the shared default (true) apply.
        const payload = { route: { ...route, is_active: false }, groups };
        const lint = lintRoute(payload);
        if (lint.errors.length > 0 && !force) {
          return errorResult(
            env,
            `${formatLintResult("draft route", lint)}\nNothing was sent. Fix the errors (or pass force: true to create anyway).`,
          );
        }
        const body = parseShared(bulkRouteGroupCreateSchema, payload);
        const lintText = lint.errors.length + lint.warnings.length > 0 ? `\n\n${formatLintResult("draft route", lint)}` : "";
        const lintStructured = { errors: lint.errors, warnings: lint.warnings };

        if (dry_run) {
          const { data } = await http.post<AdminBulkRouteDryRunResponse>("/admin/routes/bulk-groups", body, { dry_run: "true" });
          const w = data.would_create;
          const tree = formatRouteCompact({
            route: w.route,
            route_family: {
              id: w.route.route_family_id,
              name: data.summary.creates_route_family ? `${w.route.name} (new family)` : "(existing family)",
              city: body.route.city ?? "",
              created_at: w.route.created_at,
              updated_at: w.route.updated_at,
            },
            groups: w.groups,
          });
          return okResult(
            env,
            `Dry run passed: the API ran the create and rolled it back. A real run would create ${data.summary.groups} groups ` +
              `and ${data.summary.blocks} blocks${data.summary.creates_route_family ? " and a new route family" : ""}. ` +
              `Ids below are provisional and will change.${lintText}\n\n${tree}`,
            { structured: { dry_run: true, summary: data.summary, lint: lintStructured } },
          );
        }

        const { data, liveEvents } = await http.post<AdminBulkRouteCreateResponse>("/admin/routes/bulk-groups", body);
        return finish(
          ctx,
          data.route.id,
          `Created route "${data.route.name}" id=${data.route.id} (inactive — a human activates it in the admin panel).${lintText}`,
          liveEvents,
          { lint: lintStructured },
        );
      }),
  );

  server.registerTool(
    "update_route",
    {
      title: "Update route",
      description:
        "Change route metadata (name, description, duration, distance). Reads the route and sends the merged full " +
        "body to PUT /admin/routes/:id. Cannot change language, family or the active flag (activation is human-only).",
      inputSchema: shapes.update_route,
      annotations: UPDATE,
    },
    ({ route_id, patch, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        if (Object.values(patch).every((v) => v === undefined)) {
          return errorResult(env, "Error: patch is empty — give at least one of name, description, estimated_duration_mins, estimated_distance_km.");
        }
        const detail = await locator().route(route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const r = detail.route;
        const current = {
          name: r.name,
          description: r.description ?? "",
          estimated_duration_mins: r.estimated_duration_mins,
          estimated_distance_km: r.estimated_distance_km,
        };
        const merged = {
          name: patch.name ?? current.name,
          description: patch.description ?? current.description,
          estimated_duration_mins: patch.estimated_duration_mins ?? current.estimated_duration_mins,
          estimated_distance_km: patch.estimated_distance_km ?? current.estimated_distance_km,
        };
        // routeSchema needs the full body; is_active is sent as it is today
        // (routeSchema would otherwise default it to true and activate the route).
        const body = parseShared(routeSchema, {
          ...merged,
          language: r.language,
          route_family_id: r.route_family_id,
          is_active: r.is_active,
        });
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/routes/${enc(route_id)}`,
            body,
            routeId: route_id,
            changes: diffValues(current, merged),
            summary: () => `Updated route "${body.name}" id=${route_id}.`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "add_group",
    {
      title: "Add group",
      description:
        "Add a group (a stop) to a route, optionally with its blocks and a position, in one transaction via " +
        "POST /admin/routes/:id/groups. Without position it is appended. A mid-route insert is refused while events are live.",
      inputSchema: shapes.add_group,
      annotations: CREATE,
    },
    ({ route_id, name, blocks, position, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(groupCreateSchema, {
          name,
          ...(blocks !== undefined ? { blocks } : {}),
          ...(position !== undefined ? { position } : {}),
        });
        const detail = await locator().route(route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const at = Math.min(position ?? detail.groups.length, detail.groups.length);
        const changes = [`+ group at position ${at} "${body.name}" with ${body.blocks?.length ?? 0} block(s)`];
        for (const b of body.blocks ?? []) changes.push(`    + ${blockLine(b)}`);
        const shifted = detail.groups.slice(at);
        if (shifted.length) changes.push(`~ ${shifted.length} later group(s) move down one position: ${shifted.map((g) => `"${g.name}"`).join(", ")}`);
        return execute<AdminGroupCreateResponse>(
          ctx,
          {
            method: "POST",
            path: `/admin/routes/${enc(route_id)}/groups`,
            body,
            routeId: route_id,
            changes,
            summary: (d) => `Added group "${d.group.name}" id=${d.group.id} at position ${d.group.position}.`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "update_group",
    {
      title: "Rename group",
      description: "Rename a group via PUT /admin/routes/:id/groups/:groupId.",
      inputSchema: shapes.update_group,
      annotations: UPDATE,
    },
    ({ route_id, group_id, name, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(groupUpdateSchema, { name });
        const { detail, found: group } = await locator().findGroup(group_id, route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/routes/${enc(route_id)}/groups/${enc(group_id)}`,
            body,
            routeId: route_id,
            changes: diffValues({ name: group.name }, body, `group ${group.position}`),
            summary: () => `Renamed group ${group_id} to "${body.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "delete_group",
    {
      title: "Delete group",
      description:
        "Delete a group and all of its blocks; later groups move up. Requires confirm: true. Refused while events are live on it.",
      inputSchema: shapes.delete_group,
      annotations: DELETE,
    },
    ({ route_id, group_id, confirm, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        if (confirm !== true) return errorResult(env, "Error: deletes need confirm: true. Nothing was sent.");
        const { detail, found: group } = await locator().findGroup(group_id, route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const changes = [`- ${groupLabel(group)} and its ${group.blocks.length} block(s)`];
        for (const b of group.blocks) changes.push(`    - ${b.position} ${blockLine(b)}`);
        const later = detail.groups.filter((g) => g.position > group.position);
        if (later.length) changes.push(`~ ${later.length} later group(s) move up one position`);
        return execute(
          ctx,
          {
            method: "DELETE",
            path: `/admin/routes/${enc(route_id)}/groups/${enc(group_id)}`,
            routeId: route_id,
            changes,
            summary: () => `Deleted group "${group.name}" (${group_id}).`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "add_block",
    {
      title: "Add block",
      description:
        "Add a block to a group via POST /admin/groups/:groupId/blocks. Without position it is appended; a mid-group " +
        "insert is refused while events are live in that group.",
      inputSchema: shapes.add_block,
      annotations: CREATE,
    },
    ({ group_id, block, position, route_id, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(routeBlockSchema, { ...block, ...(position !== undefined ? { position } : {}) });
        const { detail, found: group } = await locator().findGroup(group_id, route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const at = Math.min(position ?? group.blocks.length, group.blocks.length);
        const changes = [`+ ${groupLabel(group)} position ${at}: ${blockLine(body)}`];
        const shifted = group.blocks.length - at;
        if (shifted > 0) changes.push(`~ ${shifted} later block(s) in the group move down one position`);
        return execute<{ block: Block }>(
          ctx,
          {
            method: "POST",
            path: `/admin/groups/${enc(group_id)}/blocks`,
            body,
            routeId: detail.route.id,
            changes,
            summary: (d) => `Added ${d.block.type} block id=${d.block.id} at position ${d.block.position} in group "${group.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "update_block",
    {
      title: "Replace block",
      description:
        "Replace a block's type, config and delay_ms (full replacement) via PUT /admin/blocks/:blockId. " +
        "To change only some config fields, use patch_block_config.",
      inputSchema: shapes.update_block,
      annotations: UPDATE,
    },
    ({ block_id, block, route_id, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(routeBlockSchema, block);
        const { detail, found } = await locator().findBlock(block_id, route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const current = found.block;
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/blocks/${enc(block_id)}`,
            body,
            routeId: detail.route.id,
            changes: diffValues(
              { type: current.type, config: current.config, delay_ms: current.delay_ms },
              { type: body.type, config: body.config, delay_ms: body.delay_ms },
            ),
            summary: () => `Replaced block ${block_id} in group "${found.group.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "patch_block_config",
    {
      title: "Patch block config",
      description:
        "Change some fields of a block's config: reads the block, deep-merges config_patch (objects merge, arrays " +
        "such as hints and accepted_answers are replaced whole), re-validates, and PUTs the full block. " +
        "The block type cannot change here — use update_block.",
      inputSchema: shapes.patch_block_config,
      annotations: UPDATE,
    },
    ({ block_id, config_patch, route_id, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const { detail, found } = await locator().findBlock(block_id, route_id);
        const current = found.block;
        if (config_patch.type !== undefined && config_patch.type !== current.type) {
          return errorResult(
            env,
            `Error: config_patch cannot change the block type (${current.type} → ${String(config_patch.type)}). Use update_block with the complete new block. Nothing was sent.`,
          );
        }
        const merged = deepMerge(current.config, config_patch);
        const body = parseShared(routeBlockSchema, { type: current.type, config: merged, delay_ms: current.delay_ms });
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/blocks/${enc(block_id)}`,
            body,
            routeId: detail.route.id,
            changes: diffValues(current.config, body.config, "config"),
            summary: () => `Patched block ${block_id} in group "${found.group.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "move_block",
    {
      title: "Move block",
      description:
        "Move a block to a position in another (or the same) group of the same route via PUT /admin/blocks/:blockId/move. " +
        "Refused while events are live in either group.",
      inputSchema: shapes.move_block,
      annotations: UPDATE,
    },
    ({ block_id, target_group_id, position, route_id, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(blockMoveSchema, { target_group_id, position });
        const loc = locator();
        const { detail, found } = await loc.findBlock(block_id, route_id);
        const target = detail.groups.find((g) => g.id === target_group_id);
        if (!target) {
          throw localError(
            "GROUP_NOT_FOUND",
            `Target group ${target_group_id} is not in route "${detail.route.name}" (${detail.route.id}), which holds block ${block_id}. move_block only moves blocks within one route.`,
          );
        }
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const others = target.blocks.filter((b) => b.id !== block_id).length;
        const at = Math.min(position, others);
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/blocks/${enc(block_id)}/move`,
            body,
            routeId: detail.route.id,
            changes: [
              `~ block ${block_id} (${blockLine(found.block)})`,
              `    from ${groupLabel(found.group)} position ${found.block.position}`,
              `    to   ${groupLabel(target)} position ${at}${at !== position ? ` (clamped from ${position})` : ""}`,
            ],
            summary: () => `Moved block ${block_id} to group "${target.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "delete_block",
    {
      title: "Delete block",
      description:
        "Delete a block; later blocks in its group move up. Requires confirm: true. Refused while events are live in the group.",
      inputSchema: shapes.delete_block,
      annotations: DELETE,
    },
    ({ block_id, confirm, route_id, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        if (confirm !== true) return errorResult(env, "Error: deletes need confirm: true. Nothing was sent.");
        const { detail, found } = await locator().findBlock(block_id, route_id);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const later = found.group.blocks.filter((b) => b.position > found.block.position).length;
        const changes = [`- ${groupLabel(found.group)} position ${found.block.position}: ${blockLine(found.block)}`];
        if (later) changes.push(`~ ${later} later block(s) in the group move up one position`);
        return execute(
          ctx,
          {
            method: "DELETE",
            path: `/admin/blocks/${enc(block_id)}`,
            routeId: detail.route.id,
            changes,
            summary: () => `Deleted block ${block_id} from group "${found.group.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "reorder_groups",
    {
      title: "Reorder groups",
      description:
        "Set the order of a route's groups. group_ids must list every group of the route exactly once, in the new order.",
      inputSchema: shapes.reorder_groups,
      annotations: UPDATE,
    },
    ({ route_id, group_ids, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(groupReorderSchema, { group_ids });
        const detail = await locator().route(route_id);
        checkCompleteList("group", body.group_ids, detail.groups.map((g) => g.id), `route "${detail.route.name}"`);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const byId = new Map(detail.groups.map((g) => [g.id, g]));
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/routes/${enc(route_id)}/groups/reorder`,
            body,
            routeId: route_id,
            changes: orderChanges(body.group_ids, (gid) => byId.get(gid)!.position, (gid) => `"${byId.get(gid)!.name}"`),
            summary: () => `Reordered the ${body.group_ids.length} groups of route "${detail.route.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );

  server.registerTool(
    "reorder_blocks",
    {
      title: "Reorder blocks",
      description:
        "Set the order of a group's blocks. block_ids must list every block of the group exactly once, in the new order. " +
        "Refused while events are live in the group.",
      inputSchema: shapes.reorder_blocks,
      annotations: UPDATE,
    },
    ({ group_id, block_ids, route_id, confirm_live, dry_run }) =>
      writeGuard(env, async () => {
        const body = parseShared(blockReorderSchema, { block_ids });
        const { detail, found: group } = await locator().findGroup(group_id, route_id);
        checkCompleteList("block", body.block_ids, group.blocks.map((b) => b.id), `group "${group.name}"`);
        const gate = liveGate(env, detail, confirm_live, dry_run);
        if (gate.blocked) return gate.blocked;
        const byId = new Map(group.blocks.map((b) => [b.id, b]));
        return execute(
          ctx,
          {
            method: "PUT",
            path: `/admin/groups/${enc(group_id)}/blocks/reorder`,
            body,
            routeId: detail.route.id,
            changes: orderChanges(body.block_ids, (bid) => byId.get(bid)!.position, (bid) => blockLine(byId.get(bid)!)),
            summary: () => `Reordered the ${body.block_ids.length} blocks of group "${group.name}".`,
          },
          { dryRun: dry_run, note: gate.note },
        );
      }),
  );
}

/** The reorder endpoints need the complete current set, each id once. */
export function checkCompleteList(kind: "group" | "block", given: string[], current: string[], owner: string): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  const dupes = given.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  if (dupes.length) problems.push(`duplicated: ${[...new Set(dupes)].join(", ")}`);
  const currentSet = new Set(current);
  const unknown = given.filter((id) => !currentSet.has(id));
  if (unknown.length) problems.push(`not in ${owner}: ${unknown.join(", ")}`);
  const missing = current.filter((id) => !seen.has(id));
  if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
  if (problems.length) {
    throw localError(
      kind === "group" ? "INCOMPLETE_GROUP_LIST" : "INCOMPLETE_BLOCK_LIST",
      `${kind}_ids must list every ${kind} of ${owner} exactly once (${current.length} today) — ${problems.join("; ")}. Nothing was sent.`,
    );
  }
}

function orderChanges(ids: string[], oldPosition: (id: string) => number, label: (id: string) => string): string[] {
  const moved = ids
    .map((id, i) => ({ id, from: oldPosition(id), to: i }))
    .filter((m) => m.from !== m.to)
    .map((m) => `~ ${label(m.id)} (${m.id}): position ${m.from} → ${m.to}`);
  return moved;
}

