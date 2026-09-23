import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, HttpClient, parseRetryAfter } from "../client/http.js";
import { lintRoute } from "../lint/index.js";
import { readToolInputShapes } from "../tools/read.js";
import {
  FAMILY_ID,
  ROUTE_ID,
  STAGING_KEY,
  callTool,
  connect,
  fakeFetch,
  json,
  routeDetail,
  testConfig,
  textOf,
} from "./helpers.js";

const READ_TOOLS = [
  "get_route",
  "get_route_family",
  "list_message_banks",
  "list_route_families",
  "list_routes",
  "validate_route",
];

const ts = "2026-09-01T00:00:00.000Z";
const routeListItem = (overrides: Record<string, unknown> = {}) => ({
  id: ROUTE_ID,
  name: "Leeds City Centre Discovery",
  description: "",
  language: "en",
  route_family_id: FAMILY_ID,
  total_stops: 1,
  estimated_duration_mins: 60,
  estimated_distance_km: 2.5,
  is_active: false,
  created_at: ts,
  updated_at: ts,
  group_count: 2,
  ...overrides,
});

describe("tool listing", () => {
  it("lists the read tools, all annotated read-only", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { tools } = await client.listTools();
    const readTools = tools.filter((t) => t.annotations?.readOnlyHint === true);
    expect(readTools.map((t) => t.name).sort()).toEqual(READ_TOOLS);
    for (const tool of readTools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.description, tool.name).toBeTruthy();
    }
  });

  it("serialises every inputSchema to a plain JSON Schema object", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type, tool.name).toBe("object");
      expect(typeof schema.properties, tool.name).toBe("object");
      expect(JSON.parse(JSON.stringify(schema)), tool.name).toEqual(schema);
    }
  });

  it("uses transform-free input shapes (input and output JSON Schema are identical)", () => {
    for (const [name, shape] of Object.entries(readToolInputShapes)) {
      for (const [field, schema] of Object.entries(shape)) {
        // `unrepresentable: "throw"` rejects transforms/preprocess outright; a default
        // or pipe would make the input and output views differ.
        const input = z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
        const output = z.toJSONSchema(schema, { io: "output", unrepresentable: "throw" });
        expect(input, `${name}.${field}`).toEqual(output);
        expect(JSON.stringify(input), `${name}.${field}`).not.toContain('"default"');
      }
    }
  });
});

describe("read tools call the admin API", () => {
  it("list_route_families → GET /admin/route-families with the Bearer key, filtered by city", async () => {
    const families = [
      { id: FAMILY_ID, name: "Leeds", city: "Leeds", created_at: ts, updated_at: ts, routes: [] },
      { id: "f2", name: "York", city: "York", created_at: ts, updated_at: ts, routes: [] },
    ];
    const { fetch, calls } = fakeFetch(() => json({ route_families: families }));
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "list_route_families", { city: "leeds" });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.href).toBe("https://api-staging.cityroam.co.uk/admin/route-families");
    expect(calls[0].headers.authorization).toBe(`Bearer ${STAGING_KEY}`);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^\[staging\] /);
    expect(textOf(result)).toContain('"Leeds"');
    expect(textOf(result)).not.toContain("York");
    expect((result.structuredContent as { route_families: unknown[] }).route_families).toHaveLength(1);
  });

  it("get_route_family → GET /admin/route-families/:id", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        route_family: { id: FAMILY_ID, name: "Leeds", city: "Leeds", created_at: ts, updated_at: ts },
        routes: [routeListItem()],
      }),
    );
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "get_route_family", { family_id: FAMILY_ID });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe(`/admin/route-families/${FAMILY_ID}`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${STAGING_KEY}`);
    expect(textOf(result)).toMatch(/^\[staging\] Route family "Leeds"/);
    expect(textOf(result)).toContain(ROUTE_ID);
  });

  it("list_routes → GET /admin/routes, with client-side filters", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ routes: [routeListItem(), routeListItem({ id: "r2", language: "fr", is_active: true })] }),
    );
    const client = await connect(testConfig(), fetch);
    const all = await callTool(client, "list_routes");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe("/admin/routes");
    expect(calls[0].url.search).toBe("");
    expect((all.structuredContent as { routes: unknown[] }).routes).toHaveLength(2);

    const fr = await callTool(client, "list_routes", { language: "fr", is_active: true });
    expect((fr.structuredContent as { routes: { id: string }[] }).routes.map((r) => r.id)).toEqual(["r2"]);
  });

  it("get_route → GET /admin/routes/:id, compact by default", async () => {
    const { fetch, calls } = fakeFetch(() => json(routeDetail()));
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "get_route", { route_id: ROUTE_ID });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe(`/admin/routes/${ROUTE_ID}`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${STAGING_KEY}`);
    const text = textOf(result);
    expect(text).toMatch(/^\[staging\] Route "Leeds City Centre Discovery"/);
    expect(text).toContain('Group 0 "Introduction" id=g1');
    expect(text).toContain("  0 question 0ms | I stand with columns tall and proud");
    expect(text).toContain("#b2");
    // Block previews are cut to 80 characters.
    const introLine = text.split("\n").find((l) => l.includes("#b1"))!;
    const preview = introLine.split(" | ")[1].split("  #")[0];
    expect(preview.length).toBeLessThanOrEqual(80);
  });

  it("get_route format=tree returns the full JSON", async () => {
    const { fetch } = fakeFetch(() => json(routeDetail()));
    const client = await connect(testConfig(), fetch);
    const text = textOf(await callTool(client, "get_route", { route_id: ROUTE_ID, format: "tree" }));
    expect(text).toContain('"accepted_answers"');
    expect(text).toContain('"Think civic buildings."');
  });

  it("list_message_banks → GET /admin/message-banks?type&language, and filters language locally", async () => {
    const entry = (id: string, language: string) => ({
      id,
      type: "success",
      language,
      content: `Nice one (${language})`,
      is_active: true,
      created_at: ts,
      updated_at: ts,
    });
    // The API ignores `language` today, so it returns both languages.
    const { fetch, calls } = fakeFetch(() => json({ message_banks: [entry("m1", "en"), entry("m2", "fr")] }));
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "list_message_banks", { type: "success", language: "fr" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe("/admin/message-banks");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ type: "success", language: "fr" });
    expect((result.structuredContent as { message_banks: { id: string }[] }).message_banks.map((m) => m.id)).toEqual([
      "m2",
    ]);
    expect(textOf(result)).toContain("Nice one (fr)");
    expect(textOf(result)).not.toContain("Nice one (en)");
  });

  it("list_message_banks sends no query string when unfiltered", async () => {
    const { fetch, calls } = fakeFetch(() => json({ message_banks: [] }));
    const client = await connect(testConfig(), fetch);
    await callTool(client, "list_message_banks");
    expect(calls[0].url.search).toBe("");
  });
});

describe("validate_route", () => {
  it("lints a stored route after GET /admin/routes/:id", async () => {
    const { fetch, calls } = fakeFetch(() => json(routeDetail()));
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "validate_route", { route_id: ROUTE_ID });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe(`/admin/routes/${ROUTE_ID}`);
    const expected = lintRoute(routeDetail());
    expect(result.structuredContent).toEqual({
      valid: expected.errors.length === 0,
      errors: expected.errors,
      warnings: expected.warnings,
    });
    expect(textOf(result)).toMatch(/^\[staging\] Lint route "Leeds City Centre Discovery"/);
  });

  it("lints a draft payload without calling the API, grouping issues", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const client = await connect(testConfig(), fetch);
    const payload = {
      route: { city: "Leeds", name: "Draft", language: "en", estimated_duration_mins: 60, estimated_distance_km: 2, is_active: false },
      groups: [
        {
          name: "Leeds Town Hall",
          blocks: [
            {
              type: "question",
              config: { type: "question", clue: "Where?", accepted_answers: ["Town Hall"], hints: [] },
              delay_ms: 0,
            },
          ],
        },
      ],
    };
    const result = await callTool(client, "validate_route", { payload });
    expect(calls).toHaveLength(0);
    const structured = result.structuredContent as { valid: boolean; errors: { rule: string }[] };
    expect(structured.valid).toBe(false);
    expect(structured.errors.map((e) => e.rule)).toContain("hint-count");
    const text = textOf(result);
    expect(text).toMatch(/^\[staging\] Lint draft route: \d+ errors?/);
    expect(text).toContain('Group "Leeds Town Hall":');
    expect(text).toContain("[hint-count]");
  });

  it("requires exactly one of route_id or payload", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    for (const args of [{}, { route_id: ROUTE_ID, payload: { route: {}, groups: [] } }]) {
      const result = await callTool(client, "validate_route", args);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("exactly one of route_id");
    }
  });
});

describe("errors and environment tags", () => {
  it("turns an API error into an isError result with the code and message verbatim", async () => {
    const { fetch } = fakeFetch(() => json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, 404));
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "get_route", { route_id: ROUTE_ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("[staging] Error ROUTE_NOT_FOUND (HTTP 404): Route not found");
  });

  it("reports a missing scope as the API's 403 code", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: "This API key lacks the message-banks:read scope", code: "ADMIN_SCOPE_REQUIRED" }, 403),
    );
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "list_message_banks");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("ADMIN_SCOPE_REQUIRED");
    expect(textOf(result)).toContain("message-banks:read");
  });

  it("maps non-JSON error bodies to HTTP_<status>", async () => {
    const { fetch } = fakeFetch(() => new Response("Bad Gateway", { status: 502 }));
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "list_routes");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("[staging] Error HTTP_502 (HTTP 502): HTTP 502: Bad Gateway");
  });

  it("never puts the API key in an error", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "list_routes");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("NETWORK_ERROR");
    expect(textOf(result)).not.toContain(STAGING_KEY);
  });

  it.each([
    ["production", "[PRODUCTION]", "https://api.cityroam.co.uk"],
    ["local", "[local]", "http://localhost:3001"],
  ] as const)("prefixes %s results with %s", async (env, tagText, origin) => {
    const { fetch, calls } = fakeFetch(() => json({ routes: [] }));
    const client = await connect(testConfig({ env, apiUrl: origin }), fetch);
    const ok = await callTool(client, "list_routes");
    expect(textOf(ok).startsWith(`${tagText} `)).toBe(true);
    expect(calls[0].url.origin).toBe(origin);
  });
});

describe("HTTP client", () => {
  it("retries once on 429, honouring Retry-After", async () => {
    let n = 0;
    const { fetch, calls } = fakeFetch(() =>
      ++n === 1
        ? json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, { "Retry-After": "7" })
        : json({ routes: [routeListItem()] }),
    );
    const waits: number[] = [];
    const http = new HttpClient({ baseUrl: "https://x.test", apiKey: STAGING_KEY, fetchImpl: fetch, sleep: async (ms) => void waits.push(ms) });
    const res = await http.get<{ routes: unknown[] }>("/admin/routes");
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([7000]);
    expect(res.data.routes).toHaveLength(1);
  });

  it("gives up after one retry and surfaces the 429 as an isError result", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, { "Retry-After": "0" }),
    );
    const client = await connect(testConfig(), fetch);
    const result = await callTool(client, "list_routes");
    expect(calls).toHaveLength(2);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("RATE_LIMITED (HTTP 429): Too many requests");
  });

  it("parses Retry-After seconds and dates, capped at 30s", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("600")).toBe(30_000);
    expect(parseRetryAfter(null)).toBe(1000);
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(parseRetryAfter("Wed, 23 Sep 2026 12:00:05 GMT", now)).toBe(5000);
  });

  it("surfaces X-Live-Events to callers", async () => {
    const { fetch } = fakeFetch(() => json({ success: true }, 200, { "X-Live-Events": "3" }));
    const http = new HttpClient({ baseUrl: "https://x.test", apiKey: STAGING_KEY, fetchImpl: fetch });
    const res = await http.put("/admin/blocks/b1", { type: "message" });
    expect(res.liveEvents).toBe(3);
    const none = await new HttpClient({ baseUrl: "https://x.test", apiKey: STAGING_KEY, fetchImpl: fakeFetch(() => json({})).fetch }).get("/x");
    expect(none.liveEvents).toBeUndefined();
  });

  it("sends JSON bodies and maps errors to ApiError", async () => {
    const { fetch, calls } = fakeFetch(() => json({ error: "Name is required", code: "INVALID_INPUT" }, 400));
    const http = new HttpClient({ baseUrl: "https://x.test/", apiKey: STAGING_KEY, fetchImpl: fetch });
    const err = await http.post("/admin/routes", { name: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "INVALID_INPUT", message: "Name is required" });
    expect(calls[0].url.href).toBe("https://x.test/admin/routes");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].body).toBe('{"name":""}');
  });

  it("reports a timeout as TIMEOUT", async () => {
    const fetch = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    const http = new HttpClient({ baseUrl: "https://x.test", apiKey: STAGING_KEY, fetchImpl: fetch, timeoutMs: 10 });
    await expect(http.get("/admin/routes")).rejects.toMatchObject({ code: "TIMEOUT", status: 0 });
  });
});
