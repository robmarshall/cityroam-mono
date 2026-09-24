import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hono } from "hono";

// ── Mock db ─────────────────────────────────────────────────────────
// Only what the route facts endpoints (and requireAdmin's audit write) touch.
const fake = vi.hoisted(() => ({
  inserts: [] as Array<{ table: unknown; values: any; conflict?: any }>,
}));

vi.mock("../db/index.js", () => {
  const mockDb: any = {
    query: {
      routeFamilies: { findFirst: vi.fn() },
      routeFamilyFacts: { findFirst: vi.fn() },
      adminApiKeys: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    limit: vi.fn(async () => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    insert: vi.fn((table: unknown) => ({
      values: (values: any) => {
        const entry: { table: unknown; values: any; conflict?: any } = { table, values };
        fake.inserts.push(entry);
        return Object.assign(Promise.resolve(), {
          onConflictDoUpdate: (conflict: any) => {
            entry.conflict = conflict;
            return {
              returning: async () => [{ ...values, updated_at: values.updated_at ?? new Date() }],
            };
          },
        });
      },
    })),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { adminAuditLog, routeFamilyFacts } from "../db/schema/index.js";
import { rowToFacts } from "../routes/route-facts.js";
import { createTestApp, adminRequest, apiKeyRequest, createTestApiKey, jsonRequest } from "./helpers.js";

const mockDb = db as any;
const FAMILY = "11111111-1111-4111-8111-111111111111";

const startPoint = {
  label: { en: "City Square", es: "", fr: null, de: "City Square", nl: "City Square" },
  lat: 53.7963,
  lng: -1.5477,
  mapUrl: "https://maps.google.com/?q=53.7963,-1.5477",
};

const facts = {
  startPoint,
  distanceKm: 2.5,
  durationMins: 60,
  stops: 4,
  stepFree: "mostly",
  dogs: true,
  toilets: "on_route",
  covered: "some",
};

const savedRow = {
  route_family_id: FAMILY,
  start_label: { en: "City Square", es: null, fr: null, de: null, nl: null },
  start_lat: 53.7963,
  start_lng: -1.5477,
  start_map_url: "https://maps.google.com/?q=53.7963,-1.5477",
  distance_km: 2.5,
  duration_mins: 60,
  stops: 4,
  step_free: "yes",
  dogs: false,
  toilets: "at_start",
  covered: "most",
  updated_at: new Date("2026-09-24T10:00:00.000Z"),
};

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  fake.inserts.length = 0;
  app = createTestApp();
  (redis as any).eval.mockResolvedValue(1);
  mockDb.query.routeFamilies.findFirst.mockResolvedValue({ id: FAMILY });
  mockDb.query.routeFamilyFacts.findFirst.mockResolvedValue(undefined);
  mockDb.limit.mockResolvedValue([{ id: "route-1" }]);
  for (const spy of ["log", "warn", "error"] as const) vi.spyOn(console, spy).mockImplementation(() => {});
});

const factInserts = () => fake.inserts.filter((i) => i.table === routeFamilyFacts);

describe("GET /admin/route-families/:id/facts", () => {
  it("returns all-null facts for a family nobody has filled in", async () => {
    const res = await adminRequest(app, "GET", `/admin/route-families/${FAMILY}/facts`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      route_family_id: FAMILY,
      facts: {
        startPoint: null,
        distanceKm: null,
        durationMins: null,
        stops: null,
        stepFree: null,
        dogs: null,
        toilets: null,
        covered: null,
        updatedAt: null,
      },
    });
  });

  it("maps a saved row to the shared shape", async () => {
    mockDb.query.routeFamilyFacts.findFirst.mockResolvedValue(savedRow);
    const body = await (await adminRequest(app, "GET", `/admin/route-families/${FAMILY}/facts`)).json();
    expect(body.facts).toEqual({
      startPoint: {
        label: { en: "City Square", es: null, fr: null, de: null, nl: null },
        lat: 53.7963,
        lng: -1.5477,
        mapUrl: "https://maps.google.com/?q=53.7963,-1.5477",
      },
      distanceKm: 2.5,
      durationMins: 60,
      stops: 4,
      stepFree: "yes",
      dogs: false,
      toilets: "at_start",
      covered: "most",
      updatedAt: "2026-09-24T10:00:00.000Z",
    });
  });

  it("404s for an unknown family, and for a malformed id without querying", async () => {
    mockDb.query.routeFamilies.findFirst.mockResolvedValueOnce(undefined);
    const unknown = await adminRequest(app, "GET", `/admin/route-families/${FAMILY}/facts`);
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).code).toBe("ROUTE_FAMILY_NOT_FOUND");

    mockDb.query.routeFamilies.findFirst.mockClear();
    const malformed = await adminRequest(app, "GET", "/admin/route-families/not-a-uuid/facts");
    expect(malformed.status).toBe(404);
    expect(mockDb.query.routeFamilies.findFirst).not.toHaveBeenCalled();
  });

  it("needs a signed-in admin or a routes:read key", async () => {
    const anonymous = await jsonRequest(app, "GET", `/admin/route-families/${FAMILY}/facts`);
    expect(anonymous.status).toBe(401);

    const { token: wrongScope } = createTestApiKey(["message-banks:read"]);
    const refused = await apiKeyRequest(app, wrongScope, "GET", `/admin/route-families/${FAMILY}/facts`);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toContain("routes:read");

    const { token } = createTestApiKey(["routes:read"]);
    expect((await apiKeyRequest(app, token, "GET", `/admin/route-families/${FAMILY}/facts`)).status).toBe(200);
  });
});

describe("PUT /admin/route-families/:id/facts", () => {
  it("upserts the validated facts and returns them with updatedAt", async () => {
    const res = await adminRequest(app, "PUT", `/admin/route-families/${FAMILY}/facts`, {
      ...facts,
      updatedAt: "ignored",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route_family_id).toBe(FAMILY);
    expect(body.facts.startPoint.label).toEqual({ en: "City Square", es: null, fr: null, de: "City Square", nl: "City Square" });
    expect(body.facts.stepFree).toBe("mostly");
    expect(body.facts.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const [insert] = factInserts();
    expect(insert.values).toMatchObject({
      route_family_id: FAMILY,
      start_lat: 53.7963,
      start_lng: -1.5477,
      start_map_url: startPoint.mapUrl,
      distance_km: 2.5,
      duration_mins: 60,
      stops: 4,
      step_free: "mostly",
      dogs: true,
      toilets: "on_route",
      covered: "some",
    });
    // A second save replaces the row rather than failing on the primary key.
    expect(insert.conflict.target).toBe(routeFamilyFacts.route_family_id);
    expect(insert.conflict.set).not.toHaveProperty("route_family_id");
  });

  it("clears the start point columns together", async () => {
    await adminRequest(app, "PUT", `/admin/route-families/${FAMILY}/facts`, { ...facts, startPoint: null });
    expect(factInserts()[0].values).toMatchObject({
      start_label: null,
      start_lat: null,
      start_lng: null,
      start_map_url: null,
    });
  });

  it("rejects an invalid body with the field path, saving nothing", async () => {
    const res = await adminRequest(app, "PUT", `/admin/route-families/${FAMILY}/facts`, {
      ...facts,
      startPoint: { ...startPoint, mapUrl: "https://example.com" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("startPoint.mapUrl");
    expect(factInserts()).toHaveLength(0);
  });

  it("rejects a partial body: a save replaces every fact", async () => {
    const res = await adminRequest(app, "PUT", `/admin/route-families/${FAMILY}/facts`, { distanceKm: 3 });
    expect(res.status).toBe(400);
    expect(factInserts()).toHaveLength(0);
  });

  it("404s for an unknown family", async () => {
    mockDb.query.routeFamilies.findFirst.mockResolvedValueOnce(undefined);
    const res = await adminRequest(app, "PUT", `/admin/route-families/${FAMILY}/facts`, facts);
    expect(res.status).toBe(404);
    expect(factInserts()).toHaveLength(0);
  });

  it("needs routes:write for a key, and is audited", async () => {
    const { token: readOnly } = createTestApiKey(["routes:read"]);
    const refused = await apiKeyRequest(app, readOnly, "PUT", `/admin/route-families/${FAMILY}/facts`, facts);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toContain("routes:write");

    fake.inserts.length = 0;
    const { token } = createTestApiKey(["routes:write"]);
    const ok = await apiKeyRequest(app, token, "PUT", `/admin/route-families/${FAMILY}/facts`, facts);
    expect(ok.status).toBe(200);
    const audit = fake.inserts.find((i) => i.table === adminAuditLog);
    expect(audit?.values).toMatchObject({ method: "PUT", status: 200 });
  });
});

describe("GET /public/route-families/:id/facts", () => {
  it("returns only the facts, cacheable, without auth", async () => {
    mockDb.query.routeFamilyFacts.findFirst.mockResolvedValue(savedRow);
    const res = await app.request(`/public/route-families/${FAMILY}/facts`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["facts"]);
    expect(Object.keys(body.facts).sort()).toEqual(
      ["covered", "distanceKm", "dogs", "durationMins", "startPoint", "stepFree", "stops", "toilets", "updatedAt"],
    );
    expect(body.facts.distanceKm).toBe(2.5);
  });

  it("returns all-null facts for an active family with nothing entered", async () => {
    const body = await (await app.request(`/public/route-families/${FAMILY}/facts`)).json();
    expect(body.facts.startPoint).toBeNull();
    expect(body.facts.updatedAt).toBeNull();
  });

  it("404s for a family with no active route, without reading its facts", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = await app.request(`/public/route-families/${FAMILY}/facts`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ROUTE_FAMILY_NOT_FOUND");
    expect(mockDb.query.routeFamilyFacts.findFirst).not.toHaveBeenCalled();
  });

  it("404s for a malformed id", async () => {
    const res = await app.request("/public/route-families/abc/facts");
    expect(res.status).toBe(404);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("rate limits per IP", async () => {
    (redis as any).eval.mockResolvedValueOnce([121, 30]);
    const res = await app.request(`/public/route-families/${FAMILY}/facts`, { headers: { "x-real-ip": "203.0.113.7" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((redis as any).eval.mock.calls[0][2]).toBe("ratelimit:public-route-facts:203.0.113.7");
  });
});

describe("rowToFacts", () => {
  it("reads a numeric distance returned as a string", () => {
    expect(rowToFacts({ ...savedRow, distance_km: "2.50" as unknown as number }).distanceKm).toBe(2.5);
  });

  it("hides a half-filled start point rather than showing it", () => {
    expect(rowToFacts({ ...savedRow, start_map_url: null }).startPoint).toBeNull();
  });
});
