import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AdminRouteDetailResponse } from "@cityroam/shared/types";
import { deepMerge, diffValues } from "../tools/write.js";
import { writeToolInputShapes } from "../tools/wire-schemas.js";
import { callTool, connect, fakeFetch, json, testConfig, textOf, type RecordedCall } from "./helpers.js";

const ts = "2026-09-01T00:00:00.000Z";
const R = "aaaaaaaa-0000-4000-8000-000000000001";
const R2 = "aaaaaaaa-0000-4000-8000-000000000002";
const NEW_R = "aaaaaaaa-0000-4000-8000-000000000009";
const F = "ffffffff-0000-4000-8000-000000000001";
const G1 = "bbbbbbbb-0000-4000-8000-000000000001";
const G2 = "bbbbbbbb-0000-4000-8000-000000000002";
const G9 = "bbbbbbbb-0000-4000-8000-000000000009";
const B1 = "cccccccc-0000-4000-8000-000000000001";
const B2 = "cccccccc-0000-4000-8000-000000000002";
const B3 = "cccccccc-0000-4000-8000-000000000003";
const B9 = "cccccccc-0000-4000-8000-000000000009";

const hints = [
  [{ content: "Think civic buildings.", image_url: null, delay_ms: 0 }],
  [{ content: "It's on The Headrow.", image_url: null, delay_ms: 0 }],
];
const questionConfig = {
  type: "question" as const,
  clue: "I stand with columns tall and proud, where justice once was served aloud.",
  accepted_answers: ["Leeds Town Hall", "Town Hall"],
  hints,
};

function detail(options: { active?: boolean; id?: string; name?: string } = {}): AdminRouteDetailResponse {
  const routeId = options.id ?? R;
  const g = (id: string, position: number, name: string) => ({
    id,
    route_id: routeId,
    position,
    name,
    created_at: ts,
    updated_at: ts,
  });
  const block = (id: string, group_id: string, position: number, config: Record<string, unknown>) => ({
    id,
    group_id,
    position,
    type: config.type,
    config,
    delay_ms: 0,
    created_at: ts,
  });
  if (routeId !== R) {
    return {
      route: { ...detail().route, id: routeId, name: options.name ?? "Other route", is_active: options.active ?? false },
      route_family: { id: F, name: "York", city: "York", created_at: ts, updated_at: ts },
      groups: [{ ...g(G9, 0, "Elsewhere"), blocks: [block(B9, G9, 0, { type: "message", content: "Hi" })] }],
    } as unknown as AdminRouteDetailResponse;
  }
  return {
    route: {
      id: R,
      name: options.name ?? "Leeds City Centre Discovery",
      description: "A walk through Leeds.",
      language: "en",
      route_family_id: F,
      total_stops: 2,
      estimated_duration_mins: 60,
      estimated_distance_km: 2.5,
      is_active: options.active ?? false,
      created_at: ts,
      updated_at: ts,
    },
    route_family: { id: F, name: "Leeds", city: "Leeds", created_at: ts, updated_at: ts },
    groups: [
      {
        ...g(G1, 0, "Introduction"),
        blocks: [
          block(B1, G1, 0, { type: "message", content: "Right then. Welcome to Leeds." }),
          block(B3, G1, 1, { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds" }),
        ],
      },
      { ...g(G2, 1, "Leeds Town Hall"), blocks: [block(B2, G2, 0, questionConfig)] },
    ],
  } as unknown as AdminRouteDetailResponse;
}

interface ServerState {
  active?: boolean;
  /** Response to the (single) non-GET request. */
  write?: () => Response;
  /** What GET /admin/routes/:id returns once a write has happened. */
  after?: AdminRouteDetailResponse;
}

/** Fake admin API: routes R and R2, list, and a canned write response. */
function api(state: ServerState = {}) {
  let wrote = false;
  const faked = fakeFetch((call: RecordedCall) => {
    const path = call.url.pathname;
    if (call.method === "GET") {
      if (path === "/admin/routes") {
        return json({ routes: [{ id: R2 }, { id: R }] });
      }
      if (path === `/admin/routes/${R}`) return json(wrote && state.after ? state.after : detail({ active: state.active }));
      if (path === `/admin/routes/${R2}`) return json(detail({ id: R2 }));
      if (path === `/admin/routes/${NEW_R}`) return json(detail({ id: NEW_R, name: "Brand new" }));
      return json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, 404);
    }
    wrote = true;
    return state.write ? state.write() : json({ success: true });
  });
  return faked;
}

const writes = (calls: RecordedCall[]) => calls.filter((c) => c.method !== "GET");
const bodyOf = (call: RecordedCall) => (call.body === undefined ? undefined : JSON.parse(call.body));

const createInput = () => ({
  route: {
    name: "Leeds Discovery",
    description: "A walk.",
    language: "en",
    city: "Leeds",
    estimated_duration_mins: 90,
    estimated_distance_km: 3,
  },
  groups: [
    { name: "Introduction", blocks: [{ type: "message", config: { type: "message", content: "Right then. Welcome." } }] },
    {
      name: "Leeds Town Hall",
      blocks: [
        { type: "question", config: questionConfig },
        { type: "message", config: { type: "message", content: "Spot on." }, delay_ms: 1500 },
      ],
    },
  ],
});

const createdResponse = () =>
  json(
    {
      route: { ...detail().route, id: NEW_R, name: "Leeds Discovery" },
      groups: [],
    },
    201,
  );

interface Case {
  tool: string;
  args: Record<string, unknown>;
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  write?: () => Response;
  /** The route re-fetched after the write. */
  refetch?: string;
}

const messageBlock = { type: "message", config: { type: "message", content: "Look up." } };

const CASES: Case[] = [
  {
    tool: "create_route",
    args: createInput(),
    method: "POST",
    path: "/admin/routes/bulk-groups",
    body: {
      route: { ...createInput().route, is_active: false },
      groups: [
        { name: "Introduction", blocks: [{ type: "message", config: { type: "message", content: "Right then. Welcome." }, delay_ms: 0 }] },
        {
          name: "Leeds Town Hall",
          blocks: [
            { type: "question", config: questionConfig, delay_ms: 0 },
            { type: "message", config: { type: "message", content: "Spot on." }, delay_ms: 1500 },
          ],
        },
      ],
    },
    write: createdResponse,
    refetch: NEW_R,
  },
  {
    tool: "update_route",
    args: { route_id: R, patch: { name: "Leeds Renamed", estimated_distance_km: 3.1 } },
    method: "PUT",
    path: `/admin/routes/${R}`,
    body: {
      name: "Leeds Renamed",
      description: "A walk through Leeds.",
      language: "en",
      route_family_id: F,
      estimated_duration_mins: 60,
      estimated_distance_km: 3.1,
      is_active: false,
    },
  },
  {
    tool: "add_group",
    args: { route_id: R, name: "Corn Exchange", position: 1, blocks: [messageBlock] },
    method: "POST",
    path: `/admin/routes/${R}/groups`,
    body: { name: "Corn Exchange", position: 1, blocks: [{ ...messageBlock, delay_ms: 0 }] },
    write: () => json({ group: { id: G9, name: "Corn Exchange", position: 1, blocks: [] } }, 201),
  },
  {
    tool: "update_group",
    args: { route_id: R, group_id: G1, name: "Welcome" },
    method: "PUT",
    path: `/admin/routes/${R}/groups/${G1}`,
    body: { name: "Welcome" },
  },
  {
    tool: "delete_group",
    args: { route_id: R, group_id: G2, confirm: true },
    method: "DELETE",
    path: `/admin/routes/${R}/groups/${G2}`,
  },
  {
    tool: "add_block",
    args: { group_id: G1, route_id: R, block: messageBlock, position: 1 },
    method: "POST",
    path: `/admin/groups/${G1}/blocks`,
    body: { ...messageBlock, delay_ms: 0, position: 1 },
    write: () => json({ block: { id: B9, type: "message", position: 1 } }, 201),
  },
  {
    tool: "update_block",
    args: { block_id: B1, route_id: R, block: { type: "action", config: { type: "action", label: "I'm here" }, delay_ms: 500 } },
    method: "PUT",
    path: `/admin/blocks/${B1}`,
    body: { type: "action", config: { type: "action", label: "I'm here" }, delay_ms: 500 },
  },
  {
    tool: "patch_block_config",
    args: { block_id: B2, route_id: R, config_patch: { accepted_answers: ["Town Hall", "Leeds Town Hall", "The Town Hall"] } },
    method: "PUT",
    path: `/admin/blocks/${B2}`,
    body: {
      type: "question",
      config: { ...questionConfig, accepted_answers: ["Town Hall", "Leeds Town Hall", "The Town Hall"] },
      delay_ms: 0,
    },
  },
  {
    tool: "move_block",
    args: { block_id: B3, route_id: R, target_group_id: G2, position: 0 },
    method: "PUT",
    path: `/admin/blocks/${B3}/move`,
    body: { target_group_id: G2, position: 0 },
  },
  {
    tool: "delete_block",
    args: { block_id: B1, route_id: R, confirm: true },
    method: "DELETE",
    path: `/admin/blocks/${B1}`,
  },
  {
    tool: "reorder_groups",
    args: { route_id: R, group_ids: [G2, G1] },
    method: "PUT",
    path: `/admin/routes/${R}/groups/reorder`,
    body: { group_ids: [G2, G1] },
  },
  {
    tool: "reorder_blocks",
    args: { group_id: G1, route_id: R, block_ids: [B3, B1] },
    method: "PUT",
    path: `/admin/groups/${G1}/blocks/reorder`,
    body: { block_ids: [B3, B1] },
  },
];

const WRITE_TOOLS = CASES.map((c) => c.tool).sort();
/** Every tool that edits an existing route (all but create_route). */
const EXISTING_ROUTE_CASES = CASES.filter((c) => c.tool !== "create_route");

describe("write tool listing", () => {
  it("registers every write tool with write annotations", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of WRITE_TOOLS) {
      const tool = byName.get(name);
      expect(tool, name).toBeDefined();
      expect(tool!.annotations?.readOnlyHint, name).toBe(false);
      expect(tool!.annotations?.destructiveHint, name).toBe(name.startsWith("delete_"));
      const idempotent = name.startsWith("update_") || name.startsWith("reorder_") || name === "patch_block_config" || name === "move_block";
      expect(tool!.annotations?.idempotentHint, name).toBe(idempotent);
      expect(tool!.description, name).toBeTruthy();
    }
  });

  it("never exposes is_active on any write input", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { tools } = await client.listTools();
    for (const name of WRITE_TOOLS) {
      const schema = JSON.stringify(tools.find((t) => t.name === name)!.inputSchema);
      expect(schema, name).not.toContain("is_active");
    }
  });

  it("makes confirm a required literal true on deletes", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { tools } = await client.listTools();
    for (const name of ["delete_group", "delete_block"]) {
      const schema = tools.find((t) => t.name === name)!.inputSchema as {
        required?: string[];
        properties: Record<string, { const?: unknown }>;
      };
      expect(schema.required, name).toContain("confirm");
      expect(schema.properties.confirm.const, name).toBe(true);
    }
  });

  it("uses transform-free input shapes that serialise to JSON Schema", () => {
    // Nested z.object()s gain `additionalProperties: false` in the output view
    // only (unknown keys are stripped) — not a transform, so ignore it.
    const strip = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(strip)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== "additionalProperties").map(([k, v]) => [k, strip(v)]))
        : value;
    for (const [name, shape] of Object.entries(writeToolInputShapes)) {
      for (const [field, schema] of Object.entries(shape)) {
        const input = z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
        const output = z.toJSONSchema(schema, { io: "output", unrepresentable: "throw" });
        expect(strip(input), `${name}.${field}`).toEqual(strip(output));
        expect(JSON.stringify(input), `${name}.${field}`).not.toContain('"default"');
      }
    }
  });
});

describe("endpoint mapping", () => {
  it.each(CASES.map((c) => [c.tool, c] as const))("%s → exact method, path, query and body", async (_name, c) => {
    const { fetch, calls } = api({ write: c.write });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, c.tool, c.args);

    expect(result.isError, textOf(result)).toBeFalsy();
    const sent = writes(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe(c.method);
    expect(sent[0].url.pathname).toBe(c.path);
    expect(Object.fromEntries(sent[0].url.searchParams)).toEqual(c.query ?? {});
    expect(bodyOf(sent[0])).toEqual(c.body);
    if (c.body !== undefined) expect(sent[0].headers["content-type"]).toBe("application/json");

    // Re-fetch after the write, and the compact tree in the result.
    const last = calls[calls.length - 1];
    expect(last.method).toBe("GET");
    expect(last.url.pathname).toBe(`/admin/routes/${c.refetch ?? R}`);
    expect(calls.indexOf(last)).toBeGreaterThan(calls.indexOf(sent[0]));
    expect(textOf(result)).toMatch(/^\[staging\] /);
    expect(textOf(result)).toMatch(/Group 0 ".*" id=/);
  });

  it("create_route with dry_run → POST ?dry_run=true, no re-fetch", async () => {
    const { fetch, calls } = api({
      write: () =>
        json({
          dry_run: true,
          valid: true,
          summary: { groups: 2, blocks: 3, creates_route_family: true },
          ids_provisional: true,
          would_create: { route: { ...detail().route, id: NEW_R }, groups: detail().groups },
        }),
    });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "create_route", { ...createInput(), dry_run: true });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.pathname).toBe("/admin/routes/bulk-groups");
    expect(calls[0].url.searchParams.get("dry_run")).toBe("true");
    expect(bodyOf(calls[0]).route.is_active).toBe(false);
    expect(textOf(result)).toContain("Dry run passed");
    expect(textOf(result)).toContain("provisional");
  });

  it("finds the route of a block by scanning routes when no route_id is given, caching per call", async () => {
    const { fetch, calls } = api({ write: () => json({ block: { id: B9, type: "message", position: 2 } }, 201) });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "add_block", { group_id: G1, block: messageBlock });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "GET /admin/routes",
      `GET /admin/routes/${R2}`,
      `GET /admin/routes/${R}`,
      `POST /admin/groups/${G1}/blocks`,
      `GET /admin/routes/${R}`,
    ]);
  });

  it("reports an unknown block without writing", async () => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "delete_block", { block_id: "cccccccc-0000-4000-8000-00000000dead", confirm: true });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("BLOCK_NOT_FOUND");
    expect(writes(calls)).toHaveLength(0);
  });

  it("refuses to move a block into a group of another route", async () => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "move_block", { block_id: B1, route_id: R, target_group_id: G9, position: 0 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("GROUP_NOT_FOUND");
    expect(writes(calls)).toHaveLength(0);
  });
});

describe("create_route safety", () => {
  it("always sends is_active: false, even when the caller tries to activate", async () => {
    const { fetch, calls } = api({ write: createdResponse });
    const client = await connect(testConfig(), fetch);
    const input = createInput();
    await callTool(client, "create_route", { ...input, route: { ...input.route, is_active: true } });
    expect(bodyOf(writes(calls)[0]).route.is_active).toBe(false);
  });

  it("blocks on lint errors unless force is true", async () => {
    const input = createInput();
    input.groups[0].blocks[0].config = { type: "message", content: "Welcome to {{NOT_A_VARIABLE}}." };

    const blocked = api({ write: createdResponse });
    let client = await connect(testConfig(), blocked.fetch);
    const refused = await callTool(client, "create_route", input);
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toContain("template-unknown");
    expect(textOf(refused)).toContain("force: true");
    expect(blocked.calls).toHaveLength(0);

    const forced = api({ write: createdResponse });
    client = await connect(testConfig(), forced.fetch);
    const result = await callTool(client, "create_route", { ...input, force: true });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(writes(forced.calls)).toHaveLength(1);
  });

  it("attaches lint warnings to a successful create", async () => {
    const input = createInput();
    input.groups[1].blocks[0].config = { ...questionConfig, accepted_answers: ["Town Hall"] };
    const { fetch } = api({ write: createdResponse });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "create_route", input);
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(textOf(result)).toContain("accepted-answer-count");
    const lint = (result.structuredContent as { lint: { warnings: unknown[] } }).lint;
    expect(lint.warnings.length).toBeGreaterThan(0);
  });

  it("maps 403 ADMIN_SCOPE_REQUIRED to activation guidance", async () => {
    const { fetch } = api({
      write: () => json({ error: "This API key lacks the routes:publish scope", code: "ADMIN_SCOPE_REQUIRED" }, 403),
    });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "create_route", createInput());
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("ADMIN_SCOPE_REQUIRED (HTTP 403)");
    expect(textOf(result)).toContain("human-only");
    expect(textOf(result)).toContain("Nothing was changed.");
  });
});

describe("shared-schema validation happens before any HTTP", () => {
  const invalid: Array<[string, Record<string, unknown>]> = [
    ["update_block", { block_id: B1, route_id: R, block: { type: "message", config: { type: "action", label: "Go" } } }],
    [
      "add_group",
      {
        route_id: R,
        name: "Bad image",
        blocks: [{ type: "image", config: { type: "image", image_url: "not a url or placeholder" } }],
      },
    ],
    ["add_block", { group_id: G1, route_id: R, block: { type: "map", config: { type: "map", google_maps_link: "nope" } } }],
    ["reorder_groups", { route_id: R, group_ids: ["g1", "g2"] }],
    ["move_block", { block_id: B1, route_id: R, target_group_id: "not-a-uuid", position: 0 }],
    ["update_group", { route_id: R, group_id: G1, name: "   " }],
  ];

  it.each(invalid)("%s rejects locally", async (tool, args) => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, tool, args);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("INVALID_INPUT");
    expect(calls).toHaveLength(0);
  });

  it("create_route with a bad family id and no city sends nothing", async () => {
    const input = createInput();
    const { city: _city, ...route } = input.route;
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "create_route", { ...input, route: { ...route, route_family_id: "nope" } });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("patch_block_config re-validates the merged config (GET only)", async () => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "patch_block_config", { block_id: B2, route_id: R, config_patch: { hints: [hints[0]] } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("INVALID_INPUT");
    expect(writes(calls)).toHaveLength(0);
  });

  it("patch_block_config refuses to change the block type", async () => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "patch_block_config", { block_id: B1, route_id: R, config_patch: { type: "action" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("update_block");
    expect(writes(calls)).toHaveLength(0);
  });
});

describe("dry_run", () => {
  it.each(EXISTING_ROUTE_CASES.map((c) => [c.tool, c] as const))(
    "%s sends only GETs and shows the would-be request",
    async (_name, c) => {
      const { fetch, calls } = api({ write: c.write });
      const client = await connect(testConfig(), fetch);
      const result = await callTool(client, c.tool, { ...c.args, dry_run: true });
      expect(result.isError, textOf(result)).toBeFalsy();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((call) => call.method === "GET")).toBe(true);
      expect(textOf(result)).toContain("nothing was sent");
      expect(textOf(result)).toContain(`Would send: ${c.method} ${c.path}`);
      const structured = result.structuredContent as { dry_run: boolean; request: { method: string; path: string; body?: unknown } };
      expect(structured.dry_run).toBe(true);
      expect(structured.request).toMatchObject({ method: c.method, path: c.path });
      expect(structured.request.body).toEqual(c.body);
    },
  );

  it("shows a readable diff", async () => {
    const { fetch } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "update_route", { route_id: R, patch: { name: "New name" }, dry_run: true });
    expect(textOf(result)).toContain('~ name: "Leeds City Centre Discovery" → "New name"');
  });

  it("on an active route is allowed without confirm_live, and says the real call needs it", async () => {
    const { fetch, calls } = api({ active: true });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "update_group", { route_id: R, group_id: G1, name: "Welcome", dry_run: true });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("confirm_live: true");
    expect(writes(calls)).toHaveLength(0);
  });
});

describe("confirm_live", () => {
  it.each(EXISTING_ROUTE_CASES.map((c) => [c.tool, c] as const))(
    "%s on an ACTIVE route is refused without confirm_live",
    async (_name, c) => {
      const { fetch, calls } = api({ active: true, write: c.write });
      const client = await connect(testConfig(), fetch);
      const result = await callTool(client, c.tool, c.args);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("CONFIRM_LIVE_REQUIRED");
      expect(writes(calls)).toHaveLength(0);
    },
  );

  it.each(EXISTING_ROUTE_CASES.map((c) => [c.tool, c] as const))(
    "%s on an ACTIVE route goes ahead with confirm_live: true",
    async (_name, c) => {
      const { fetch, calls } = api({ active: true, write: c.write });
      const client = await connect(testConfig(), fetch);
      const result = await callTool(client, c.tool, { ...c.args, confirm_live: true });
      expect(result.isError, textOf(result)).toBeFalsy();
      expect(writes(calls)).toHaveLength(1);
    },
  );

  it("update_route keeps an active route active (never deactivates or activates)", async () => {
    const { fetch, calls } = api({ active: true });
    const client = await connect(testConfig(), fetch);
    await callTool(client, "update_route", { route_id: R, patch: { name: "Renamed" }, confirm_live: true });
    expect(bodyOf(writes(calls)[0]).is_active).toBe(true);
  });
});

describe("deletes need confirm: true", () => {
  it.each([
    ["delete_group", { route_id: R, group_id: G2 }],
    ["delete_block", { block_id: B1, route_id: R }],
  ] as const)("%s without confirm, or with confirm false, sends nothing", async (tool, args) => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    for (const extra of [{}, { confirm: false }]) {
      const result = await callTool(client, tool, { ...args, ...extra });
      expect(result.isError).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("reorder completeness", () => {
  it.each([
    ["missing a group", { route_id: R, group_ids: [G2] }, "missing"],
    ["duplicate group", { route_id: R, group_ids: [G2, G1, G1] }, "duplicated"],
    ["unknown group", { route_id: R, group_ids: [G2, G1, G9] }, "not in route"],
  ] as const)("reorder_groups: %s", async (_label, args, needle) => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "reorder_groups", args);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("INCOMPLETE_GROUP_LIST");
    expect(textOf(result)).toContain(needle);
    expect(writes(calls)).toHaveLength(0);
  });

  it.each([
    ["missing a block", { group_id: G1, route_id: R, block_ids: [B1] }, "missing"],
    ["block of another group", { group_id: G1, route_id: R, block_ids: [B1, B3, B2] }, "not in group"],
  ] as const)("reorder_blocks: %s", async (_label, args, needle) => {
    const { fetch, calls } = api();
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "reorder_blocks", args);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("INCOMPLETE_BLOCK_LIST");
    expect(textOf(result)).toContain(needle);
    expect(writes(calls)).toHaveLength(0);
  });
});

describe("live events and API guards", () => {
  it("surfaces X-Live-Events as a warning at the top of the result", async () => {
    const { fetch } = api({
      write: () => json({ block: {} }, 200, { "X-Live-Events": "2" }),
    });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "update_block", {
      block_id: B1,
      route_id: R,
      block: { type: "message", config: { type: "message", content: "New words." } },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^\[staging\] Warning: this route has 2 live events in progress/);
    expect((result.structuredContent as { live_events: number }).live_events).toBe(2);
  });

  it.each(["GROUP_HAS_LIVE_EVENTS", "BLOCK_HAS_LIVE_EVENTS"])("maps 409 %s to guidance", async (code) => {
    const { fetch } = api({
      write: () => json({ error: "Cannot change: 1 in-progress event", code }, 409),
    });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "delete_block", { block_id: B1, route_id: R, confirm: true });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(`${code} (HTTP 409)`);
    expect(textOf(result)).toContain("Players are part-way through this route");
    expect(textOf(result)).toContain("Nothing was changed.");
  });

  it("returns the re-fetched tree with the new state", async () => {
    const after = detail();
    after.groups[0].name = "Freshly renamed";
    const { fetch } = api({ after });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "update_group", { route_id: R, group_id: G1, name: "Freshly renamed" });
    expect(textOf(result)).toContain('Group 0 "Freshly renamed"');
  });

  it("still reports success when the re-fetch fails", async () => {
    let n = 0;
    const faked = fakeFetch((call) => {
      if (call.method !== "GET") return json({ success: true });
      n++;
      return n === 1 ? json(detail()) : json({ error: "boom", code: "INTERNAL" }, 500);
    });
    const client = await connect(testConfig(), faked.fetch);
    const result = await callTool(client, "update_group", { route_id: R, group_id: G1, name: "Welcome" });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("The write succeeded");
  });
});

describe("helpers", () => {
  it("deepMerge merges objects and replaces arrays", () => {
    expect(deepMerge({ a: 1, b: { c: 2, d: 3 }, e: [1, 2] }, { b: { d: 4 }, e: [9] })).toEqual({
      a: 1,
      b: { c: 2, d: 4 },
      e: [9],
    });
  });

  it("diffValues lists changed, added and removed paths", () => {
    expect(diffValues({ a: 1, b: [1, 2], c: "x" }, { a: 2, b: [1], d: true })).toEqual([
      "~ a: 1 → 2",
      "- b[1]: 2",
      "- c: \"x\"",
      "+ d: true",
    ]);
  });
});
