import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FAMILY_ID, callTool, fakeFetch, json, testConfig, textOf } from "../../__tests__/helpers.js";
import { connectWith } from "../../images/__tests__/fixtures.js";
import type { FetchLike } from "../../client/http.js";
import { registerRouteFactsTools, routeFactsToolInputShapes } from "../route-facts.js";

const PATH = `/admin/route-families/${FAMILY_ID}/facts`;

const current = {
  startPoint: {
    label: { en: "City Square", es: null, fr: null, de: null, nl: null },
    lat: 53.7963,
    lng: -1.5477,
    mapUrl: "https://maps.google.com/?q=53.7963,-1.5477",
  },
  distanceKm: 2.5,
  durationMins: 60,
  stops: 4,
  stepFree: null,
  dogs: null,
  toilets: null,
  covered: null,
  updatedAt: "2026-09-20T09:00:00.000Z",
};

function connect(fetch: FetchLike) {
  return connectWith(testConfig(), fetch, registerRouteFactsTools);
}

/** GET answers with `current`; PUT echoes the body back as the saved facts. */
const api = () =>
  fakeFetch((call) => {
    if (call.method === "PUT") {
      const body = JSON.parse(call.body ?? "{}");
      return json({ route_family_id: FAMILY_ID, facts: { ...body, updatedAt: "2026-09-24T10:00:00.000Z" } });
    }
    return json({ route_family_id: FAMILY_ID, facts: current });
  });

describe("route facts tools", () => {
  it("registers a read tool and a non-destructive write tool with transform-free input schemas", async () => {
    const client = await connect(api().fetch);
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect([...byName.keys()].sort()).toEqual(["get_route_facts", "update_route_facts"]);
    expect(byName.get("get_route_facts")!.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("update_route_facts")!.annotations?.readOnlyHint).toBe(false);
    expect(byName.get("update_route_facts")!.annotations?.destructiveHint).toBe(false);
    for (const [name, shape] of Object.entries(routeFactsToolInputShapes)) {
      for (const [field, schema] of Object.entries(shape)) {
        const input = z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
        const output = z.toJSONSchema(schema, { io: "output", unrepresentable: "throw" });
        expect(input, `${name}.${field}`).toEqual(output);
        expect(JSON.stringify(input), `${name}.${field}`).not.toContain('"default"');
      }
    }
  });

  it("get_route_facts → GET the family's facts, marking unset ones hidden", async () => {
    const { fetch, calls } = api();
    const result = await callTool(await connect(fetch), "get_route_facts", { family_id: FAMILY_ID });
    expect(result.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe(PATH);
    const text = textOf(result);
    expect(text).toMatch(/^\[staging\] Route facts for family id=/);
    expect(text).toContain('- startPoint: "City Square"');
    expect(text).toContain("- distanceKm: 2.5 km");
    expect(text).toContain("- stepFree: not set (hidden on the site)");
    expect(result.structuredContent).toMatchObject({ route_family_id: FAMILY_ID, facts: { distanceKm: 2.5 } });
  });

  it("update_route_facts merges the given facts over the current ones and PUTs the whole set", async () => {
    const { fetch, calls } = api();
    const result = await callTool(await connect(fetch), "update_route_facts", {
      family_id: FAMILY_ID,
      stepFree: "mostly",
      dogs: true,
      distanceKm: null,
    });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(calls[1].url.pathname).toBe(PATH);
    const { updatedAt: _u, ...rest } = current;
    expect(JSON.parse(calls[1].body!)).toEqual({ ...rest, stepFree: "mostly", dogs: true, distanceKm: null });
    const text = textOf(result);
    expect(text).toContain("- stepFree: not set (hidden on the site) → mostly");
    expect(text).toContain("- distanceKm: 2.5 km → not set (hidden on the site)");
    expect(text).not.toContain("- stops:  →");
  });

  it("dry_run only GETs and shows the exact request", async () => {
    const { fetch, calls } = api();
    const result = await callTool(await connect(fetch), "update_route_facts", {
      family_id: FAMILY_ID,
      toilets: "on_route",
      dry_run: true,
    });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect(textOf(result)).toContain(`Dry run: nothing was sent. Would PUT ${PATH} {`);
    expect(result.structuredContent).toMatchObject({ dry_run: true, method: "PUT", body: { toilets: "on_route", stops: 4 } });
  });

  it("re-parses the merged set with the shared schema and sends nothing when it fails", async () => {
    const { fetch, calls } = api();
    const client = await connect(fetch);
    const badUrl = await callTool(client, "update_route_facts", {
      family_id: FAMILY_ID,
      startPoint: { ...current.startPoint, mapUrl: "https://example.com/x" },
    });
    expect(badUrl.isError).toBe(true);
    expect(textOf(badUrl)).toContain("startPoint.mapUrl: Map URL must look like");
    expect(textOf(badUrl)).toContain("Nothing was sent");

    const badStops = await callTool(client, "update_route_facts", { family_id: FAMILY_ID, stops: 2.5 });
    expect(textOf(badStops)).toContain("stops: Stops must be a whole number");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("refuses a call that changes nothing, before any request", async () => {
    const { fetch, calls } = api();
    const result = await callTool(await connect(fetch), "update_route_facts", { family_id: FAMILY_ID, dry_run: true });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("give at least one fact");
    expect(calls).toHaveLength(0);
  });

  it("surfaces API errors verbatim", async () => {
    const { fetch } = fakeFetch(() => json({ error: "Route family not found", code: "ROUTE_FAMILY_NOT_FOUND" }, 404));
    const result = await callTool(await connect(fetch), "get_route_facts", { family_id: FAMILY_ID });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Error ROUTE_FAMILY_NOT_FOUND (HTTP 404): Route family not found");
  });
});
