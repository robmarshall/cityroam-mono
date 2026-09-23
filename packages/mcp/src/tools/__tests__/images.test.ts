import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { AdminRouteDetailResponse, SupportedLanguage } from "@cityroam/shared/types";
import { STAGING_KEY, callTool, json, routeDetail, testConfig, textOf } from "../../__tests__/helpers.js";
import type { FetchLike } from "../../client/http.js";
import type { Config } from "../../config.js";
import { JPEG, PNG, connectWith, recordingFetch, type RawCall } from "../../images/__tests__/fixtures.js";
import { MAX_IMAGE_BYTES } from "../../images/source.js";
import { MAX_SCANNED_ROUTES } from "../../images/usage.js";
import { imageToolInputShapes, registerImageTools } from "../images.js";

const API = "https://api-staging.cityroam.co.uk";
const BUCKET = "https://cityroam-staging.s3.eu-west-2.amazonaws.com";
const CDN = "https://cdn-staging.cityroam.co.uk";

let tmp: string;
let root: string;

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cityroam-mcp-img-")));
  root = path.join(tmp, "photos");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "town-hall.jpg"), JPEG);
  await fs.writeFile(path.join(root, "town-hall.png"), PNG);
  await fs.writeFile(path.join(root, "fake.jpg"), "this is not a jpeg");
  const big = new Uint8Array(MAX_IMAGE_BYTES + 10);
  big.set(JPEG);
  await fs.writeFile(path.join(root, "big.jpg"), big);
  await fs.writeFile(path.join(tmp, "outside.jpg"), JPEG);
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const config = (overrides: Partial<Config> = {}) => testConfig({ imageRoots: [root], ...overrides });

async function connect(fetch: FetchLike, cfg: Config = config()): Promise<Client> {
  return connectWith(cfg, fetch, (server, ctx) => registerImageTools(server, ctx, { fetchImpl: fetch }));
}

/** A route using `slug` in an image block and in a hint. */
function routeUsing(id: string, name: string, language: string, slug: string, extra: string[] = []): AdminRouteDetailResponse {
  const detail = routeDetail();
  detail.route = { ...detail.route, id, name, language: language as SupportedLanguage };
  const g = detail.groups[1];
  g.blocks = [
    {
      ...g.blocks[0],
      id: `${id}-img`,
      type: "image",
      config: { type: "image", image_url: `{{IMAGE:${slug}}}` },
    } as never,
    {
      ...g.blocks[0],
      id: `${id}-q`,
      config: {
        type: "question",
        clue: "Where?",
        accepted_answers: ["Here"],
        hints: [
          [{ content: "Look up.", image_url: `{{IMAGE:${slug}}}`, delay_ms: 0 }],
          [{ content: "Look around.", image_url: "https://cdn.example.com/other.jpg", delay_ms: 0 }],
          ...extra.map((value) => [{ content: "x", image_url: value, delay_ms: 0 }]),
        ],
      },
    } as never,
  ];
  return detail;
}

interface ApiState {
  exists?: boolean | null;
  existenceStatus?: number;
  routes?: AdminRouteDetailResponse[];
  images?: string[] | "fail";
  imagesTruncated?: boolean;
  putStatus?: number;
  cdn?: boolean;
}

function fakeApi(state: ApiState = {}) {
  const routes = state.routes ?? [];
  return recordingFetch((call: RawCall) => {
    const p = call.url.pathname;
    if (call.url.origin === BUCKET && call.method === "PUT") {
      return new Response(state.putStatus && state.putStatus >= 400 ? "<Error><Code>AccessDenied</Code></Error>" : "", {
        status: state.putStatus ?? 200,
      });
    }
    if (call.url.origin !== API) return new Response("unexpected host", { status: 599 });
    const slugMatch = /^\/admin\/route-images\/(.+)$/.exec(p);
    if (call.method === "GET" && slugMatch) {
      if (state.existenceStatus) return json({ error: "Forbidden", code: "FORBIDDEN" }, state.existenceStatus);
      const slug = slugMatch[1];
      const exists = state.exists === undefined ? false : state.exists;
      return json({
        slug,
        key: `route-images/${slug}.jpg`,
        placeholder: `{{IMAGE:${slug}}}`,
        url: `${CDN}/route-images/${slug}.jpg`,
        exists,
        size: exists ? 123456 : null,
        last_modified: exists ? "2026-09-01T00:00:00.000Z" : null,
      });
    }
    if (call.method === "GET" && p === "/admin/route-images") {
      if (state.images === "fail") return json({ error: "Access Denied", code: "INTERNAL_ERROR" }, 500);
      return json({
        images: (state.images ?? []).map((slug) => ({
          slug,
          key: `route-images/${slug}.jpg`,
          size: 1,
          last_modified: null,
          url: null,
        })),
        truncated: state.imagesTruncated ?? false,
      });
    }
    if (call.method === "GET" && p === "/admin/routes") {
      return json({
        routes: routes.map((r) => ({ ...r.route, group_count: r.groups.length })),
      });
    }
    const routeMatch = /^\/admin\/routes\/([^/]+)$/.exec(p);
    if (call.method === "GET" && routeMatch) {
      const found = routes.find((r) => r.route.id === routeMatch[1]);
      return found ? json(found) : json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, 404);
    }
    if (call.method === "POST" && p === "/admin/upload") {
      const body = JSON.parse(call.body as string) as { filename: string; slug?: string };
      if (body.slug) {
        const key = `route-images/${body.slug}.jpg`;
        return json({
          upload_url: `${BUCKET}/${key}?X-Amz-Signature=secret-sig`,
          key,
          url: state.cdn === false ? null : `${CDN}/${key}`,
          slug: body.slug,
          placeholder: `{{IMAGE:${body.slug}}}`,
        });
      }
      const key = `uploads/1700000000000_${body.filename}`;
      return json({ upload_url: `${BUCKET}/${key}?X-Amz-Signature=secret-sig`, key, url: `${CDN}/${key}` });
    }
    return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  });
}

const mutating = (calls: RawCall[]) => calls.filter((c) => c.method !== "GET");

describe("image tools: listing and schemas", () => {
  it("registers both tools with the right annotations", async () => {
    const client = await connect(fakeApi().fetch);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(["list_image_slugs", "upload_image"]);
    expect(byName.list_image_slugs.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.upload_image.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  });

  it("serialises every inputSchema to plain JSON Schema without transforms or defaults", async () => {
    const client = await connect(fakeApi().fetch);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type, tool.name).toBe("object");
      expect(JSON.parse(JSON.stringify(schema)), tool.name).toEqual(schema);
    }
    for (const [name, shape] of Object.entries(imageToolInputShapes)) {
      for (const [field, schema] of Object.entries(shape)) {
        const input = z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
        const output = z.toJSONSchema(schema, { io: "output", unrepresentable: "throw" });
        expect(input, `${name}.${field}`).toEqual(output);
        expect(JSON.stringify(input), `${name}.${field}`).not.toContain('"default"');
      }
    }
  });
});

describe("upload_image: local checks", () => {
  it("needs exactly one of source.path / source.url", async () => {
    const { fetch, calls } = fakeApi();
    const client = await connect(fetch);
    for (const source of [{}, { path: path.join(root, "town-hall.jpg"), url: "https://example.com/a.jpg" }]) {
      const result = await callTool(client, "upload_image", { source });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("exactly one of path");
    }
    expect(calls).toHaveLength(0);
  });

  it("rejects a path outside the roots, and path uploads when no roots are configured", async () => {
    const { fetch, calls } = fakeApi();
    const outside = await callTool(await connect(fetch), "upload_image", { source: { path: path.join(tmp, "outside.jpg") } });
    expect(outside.isError).toBe(true);
    expect(textOf(outside)).toContain("outside the allowed image folders");

    const traversal = await callTool(await connect(fetch), "upload_image", {
      source: { path: `${root}${path.sep}..${path.sep}outside.jpg` },
    });
    expect(traversal.isError).toBe(true);
    expect(textOf(traversal)).toContain("outside the allowed image folders");

    const noRoots = await callTool(await connect(fetch, config({ imageRoots: [] })), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
    });
    expect(noRoots.isError).toBe(true);
    expect(textOf(noRoots)).toContain("CITYROAM_IMAGE_ROOTS");
    expect(calls).toHaveLength(0);
  });

  it("rejects non-image bytes named .jpg", async () => {
    const { fetch, calls } = fakeApi();
    const result = await callTool(await connect(fetch), "upload_image", { source: { path: path.join(root, "fake.jpg") } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("is not a JPEG or PNG image");
    expect(calls).toHaveLength(0);
  });

  it("rejects a PNG in slug mode with conversion guidance", async () => {
    const { fetch, calls } = fakeApi();
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.png") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/PNG, but slug photos must be JPEG/);
    expect(textOf(result)).toContain("Convert it");
    expect(calls).toHaveLength(0);
  });

  it("rejects files over 5 MB", async () => {
    const { fetch, calls } = fakeApi();
    const result = await callTool(await connect(fetch), "upload_image", { source: { path: path.join(root, "big.jpg") } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("5 MB");
    expect(calls).toHaveLength(0);
  });

  it("validates the slug with the shared schema", async () => {
    const { fetch, calls } = fakeApi();
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "Leeds_Town_Hall",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("invalid slug");
    expect(calls).toHaveLength(0);
  });

  it("rejects non-http(s) URLs without fetching", async () => {
    const { fetch, calls } = fakeApi();
    const result = await callTool(await connect(fetch), "upload_image", { source: { url: "file:///C:/Windows/win.ini" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("must be an http(s) URL");
    expect(calls).toHaveLength(0);
  });
});

describe("upload_image: overwrite protection", () => {
  const routes = () => [
    routeUsing("r-en", "Leeds EN", "en", "leeds-town-hall"),
    routeUsing("r-fr", "Leeds FR", "fr", "leeds-town-hall"),
    routeUsing("r-other", "York", "en", "york-minster"),
  ];

  it("refuses when the photo exists, naming how many routes use the slug", async () => {
    const { fetch, calls } = fakeApi({ exists: true, routes: routes() });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain("refusing to upload to {{IMAGE:leeds-town-hall}}");
    expect(text).toContain("a photo already exists at route-images/leeds-town-hall.jpg");
    expect(text).toContain("used by 2 routes");
    expect(text).toContain('"Leeds FR" [fr] id=r-fr (2 references)');
    expect(text).not.toContain("York");
    expect(text).toContain("overwrite: true");
    expect(calls[0].url.pathname).toBe("/admin/route-images/leeds-town-hall");
    expect(mutating(calls)).toHaveLength(0);
  });

  it("treats exists: null as may-exist and refuses too", async () => {
    const { fetch, calls } = fakeApi({ exists: null, routes: routes() });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("exists: null");
    expect(textOf(result)).toContain("may exist");
    expect(mutating(calls)).toHaveLength(0);
  });

  it("treats a failed existence check as may-exist", async () => {
    const { fetch, calls } = fakeApi({ existenceStatus: 403 });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("existence check failed");
    expect(mutating(calls)).toHaveLength(0);
  });

  it("says when the usage scan was capped", async () => {
    const many = Array.from({ length: MAX_SCANNED_ROUTES + 3 }, (_, i) => routeUsing(`r${i}`, `Route ${i}`, "en", "x-slug"));
    const { fetch, calls } = fakeApi({ exists: true, routes: many });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "x-slug",
    });
    expect(textOf(result)).toContain(`used by ${MAX_SCANNED_ROUTES} routes`);
    expect(textOf(result)).toContain(`only the newest ${MAX_SCANNED_ROUTES} of ${MAX_SCANNED_ROUTES + 3} were read`);
    expect(calls.filter((c) => /^\/admin\/routes\/.+/.test(c.url.pathname))).toHaveLength(MAX_SCANNED_ROUTES);
  });

  it("uploads when the slug is free (exists: false) without scanning routes", async () => {
    const { fetch, calls } = fakeApi({ exists: false, routes: routes() });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBeFalsy();
    expect(calls.some((c) => c.url.pathname === "/admin/routes")).toBe(false);
    expect(mutating(calls).map((c) => c.method)).toEqual(["POST", "PUT"]);
    expect(textOf(result)).not.toContain("CDN may keep serving");
  });

  it("overwrites with overwrite: true and warns about CDN caching", async () => {
    const { fetch, calls } = fakeApi({ exists: true });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
      overwrite: true,
    });
    expect(result.isError).toBeFalsy();
    expect(mutating(calls).map((c) => c.method)).toEqual(["POST", "PUT"]);
    expect(textOf(result)).toContain("This replaced the previous photo");
    expect(textOf(result)).toContain("CDN may keep serving the old image");
    expect(result.structuredContent).toMatchObject({ overwrote: true });
  });
});

describe("upload_image: upload flow", () => {
  it("POSTs /admin/upload then PUTs the bytes with the content type and no Authorization", async () => {
    const { fetch, calls } = fakeApi({ exists: false });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBeFalsy();
    const [post, put] = mutating(calls);

    expect(post.url.href).toBe(`${API}/admin/upload`);
    expect(post.headers.authorization).toBe(`Bearer ${STAGING_KEY}`);
    expect(JSON.parse(post.body as string)).toEqual({
      filename: "leeds-town-hall.jpg",
      content_type: "image/jpeg",
      slug: "leeds-town-hall",
    });

    expect(put.url.origin).toBe(BUCKET);
    expect(put.url.pathname).toBe("/route-images/leeds-town-hall.jpg");
    expect(put.url.searchParams.get("X-Amz-Signature")).toBe("secret-sig");
    expect(put.headers["content-type"]).toBe("image/jpeg");
    expect(put.headers.authorization).toBeUndefined();
    expect(Array.from(put.body as Uint8Array)).toEqual(Array.from(JPEG));
    expect(calls.indexOf(post)).toBeLessThan(calls.indexOf(put));

    const text = textOf(result);
    expect(text).toMatch(/^\[staging\] Uploaded JPEG/);
    expect(text).toContain('Use image_url "{{IMAGE:leeds-town-hall}}"');
    expect(text).toContain(`CDN URL: ${CDN}/route-images/leeds-town-hall.jpg`);
    expect(text).toContain("production has a separate bucket");
    expect(text).not.toContain("secret-sig");
    expect(result.structuredContent).toMatchObject({
      image_url: "{{IMAGE:leeds-town-hall}}",
      placeholder: "{{IMAGE:leeds-town-hall}}",
      url: `${CDN}/route-images/leeds-town-hall.jpg`,
      overwrote: false,
    });
  });

  it("says so when the environment has no CDN URL", async () => {
    const { fetch } = fakeApi({ exists: false, cdn: false });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(textOf(result)).toContain("No CDN URL");
    expect(result.structuredContent).toMatchObject({ url: null, image_url: "{{IMAGE:leeds-town-hall}}" });
  });

  it("ad-hoc upload (no slug) of a PNG returns the absolute URL and skips the existence check", async () => {
    const { fetch, calls } = fakeApi();
    const result = await callTool(await connect(fetch), "upload_image", { source: { path: path.join(root, "town-hall.png") } });
    expect(result.isError).toBeFalsy();
    expect(calls.some((c) => c.url.pathname.startsWith("/admin/route-images"))).toBe(false);
    const [post, put] = mutating(calls);
    expect(JSON.parse(post.body as string)).toEqual({ filename: "town-hall.png", content_type: "image/png" });
    expect(put.headers["content-type"]).toBe("image/png");
    expect(textOf(result)).toContain(`Use image_url "${CDN}/uploads/1700000000000_town-hall.png"`);
  });

  it("downloads a URL source and uploads it", async () => {
    const api = fakeApi({ exists: false });
    const fetch: FetchLike = async (input, init) => {
      if (input.startsWith("https://photos.example.com/")) {
        return new Response(JPEG, { status: 200, headers: { "Content-Type": "image/jpeg" } });
      }
      return api.fetch(input, init);
    };
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { url: "https://photos.example.com/th.jpg" },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBeFalsy();
    const put = mutating(api.calls).find((c) => c.method === "PUT")!;
    expect(Array.from(put.body as Uint8Array)).toEqual(Array.from(JPEG));
  });

  it("rejects a URL served with a non-image content type", async () => {
    const api = fakeApi();
    const fetch: FetchLike = async (input, init) =>
      input.startsWith("https://photos.example.com/")
        ? new Response("<html/>", { headers: { "Content-Type": "text/html" } })
        : api.fetch(input, init);
    const result = await callTool(await connect(fetch), "upload_image", { source: { url: "https://photos.example.com/page" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not served as an image");
    expect(api.calls).toHaveLength(0);
  });

  it("reports a failed presigned PUT without leaking the signature", async () => {
    const { fetch } = fakeApi({ exists: false, putStatus: 403 });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 403");
    expect(textOf(result)).toContain("AccessDenied");
    expect(textOf(result)).not.toContain("secret-sig");
  });

  it("dry_run runs the checks and the existence GET but sends nothing mutating", async () => {
    const { fetch, calls } = fakeApi({ exists: false });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
      dry_run: true,
    });
    expect(result.isError).toBeFalsy();
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual(["GET /admin/route-images/leeds-town-hall"]);
    expect(textOf(result)).toContain("Dry run: nothing was uploaded");
    expect(textOf(result)).toContain('POST /admin/upload {"filename":"leeds-town-hall.jpg","content_type":"image/jpeg","slug":"leeds-town-hall"}');
    expect(result.structuredContent).toMatchObject({ dry_run: true, existing: "missing" });
  });

  it("dry_run still refuses an existing slug without overwrite", async () => {
    const { fetch, calls } = fakeApi({ exists: true });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
      dry_run: true,
    });
    expect(result.isError).toBe(true);
    expect(mutating(calls)).toHaveLength(0);
  });

  it("dry_run with overwrite: true on an existing slug sends nothing", async () => {
    const { fetch, calls } = fakeApi({ exists: true });
    const result = await callTool(await connect(fetch), "upload_image", {
      source: { path: path.join(root, "town-hall.jpg") },
      slug: "leeds-town-hall",
      overwrite: true,
      dry_run: true,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("would be overwritten");
    expect(mutating(calls)).toHaveLength(0);
  });
});

describe("list_image_slugs", () => {
  const routes = () => [
    routeUsing("r-en", "Leeds EN", "en", "leeds-town-hall", ["{{IMAGE:Bad_Slug}}", "/relative.jpg"]),
    routeUsing("r-fr", "Leeds FR", "fr", "corn-exchange"),
  ];

  it("aggregates usages across all routes against the uploaded set", async () => {
    const { fetch, calls } = fakeApi({ routes: routes(), images: ["leeds-town-hall", "unused-photo"] });
    const result = await callTool(await connect(fetch), "list_image_slugs");
    expect(result.isError).toBeFalsy();
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    const s = result.structuredContent as {
      used: Array<{ slug: string; uploaded: unknown; usages: Array<Record<string, unknown>> }>;
      uploaded_unused: string[];
      invalid_refs: Array<Record<string, unknown>>;
      scanned_routes: number;
      truncated: boolean;
      uploaded_state: string;
    };
    expect(s.used.map((u) => [u.slug, u.uploaded, u.usages.length])).toEqual([
      ["corn-exchange", false, 2],
      ["leeds-town-hall", true, 2],
    ]);
    expect(s.used[1].usages).toEqual([
      { route_id: "r-en", route_name: "Leeds EN", language: "en", group: "Leeds Town Hall", block_id: "r-en-img", field: "image_block" },
      { route_id: "r-en", route_name: "Leeds EN", language: "en", group: "Leeds Town Hall", block_id: "r-en-q", field: "hint" },
    ]);
    expect(s.uploaded_unused).toEqual(["unused-photo"]);
    expect(s.invalid_refs.map((r) => r.value)).toEqual(["{{IMAGE:Bad_Slug}}", "/relative.jpg"]);
    expect(s.scanned_routes).toBe(2);
    expect(s.truncated).toBe(false);
    expect(s.uploaded_state).toBe("known");
    expect(textOf(result)).toContain("corn-exchange: NOT UPLOADED");
  });

  it("marks uploaded unknown, and says why, when the bucket listing fails", async () => {
    const { fetch } = fakeApi({ routes: routes(), images: "fail" });
    const result = await callTool(await connect(fetch), "list_image_slugs");
    expect(result.isError).toBeFalsy();
    const s = result.structuredContent as { used: Array<{ uploaded: unknown }>; uploaded_unused: string[]; uploaded_state: string };
    expect(s.used.every((u) => u.uploaded === "unknown")).toBe(true);
    expect(s.uploaded_unused).toEqual([]);
    expect(s.uploaded_state).toContain("s3:ListBucket");
    expect(textOf(result)).toContain("Uploaded state unknown");
  });

  it("marks missing slugs unknown when the bucket listing was truncated", async () => {
    const { fetch } = fakeApi({ routes: routes(), images: ["leeds-town-hall"], imagesTruncated: true });
    const result = await callTool(await connect(fetch), "list_image_slugs");
    const s = result.structuredContent as { used: Array<{ slug: string; uploaded: unknown }> };
    expect(s.used.map((u) => [u.slug, u.uploaded])).toEqual([
      ["corn-exchange", "unknown"],
      ["leeds-town-hall", true],
    ]);
  });

  it("route_id reads only that route; family_id filters the list", async () => {
    const both = routes();
    both[1].route.route_family_id = "other-family";
    const one = fakeApi({ routes: both, images: [] });
    const byRoute = await callTool(await connect(one.fetch), "list_image_slugs", { route_id: "r-fr" });
    expect(one.calls.map((c) => c.url.pathname)).toEqual(["/admin/routes/r-fr", "/admin/route-images"]);
    expect((byRoute.structuredContent as { used: Array<{ slug: string }> }).used.map((u) => u.slug)).toEqual(["corn-exchange"]);

    const fam = fakeApi({ routes: both, images: [] });
    const byFamily = await callTool(await connect(fam.fetch), "list_image_slugs", { family_id: both[0].route.route_family_id });
    expect((byFamily.structuredContent as { used: Array<{ slug: string }> }).used.map((u) => u.slug)).toEqual(["leeds-town-hall"]);

    const both2 = await callTool(await connect(fam.fetch), "list_image_slugs", { route_id: "r-fr", family_id: "x" });
    expect(both2.isError).toBe(true);
  });

  it("caps the scan and reports truncation", async () => {
    const many = Array.from({ length: MAX_SCANNED_ROUTES + 1 }, (_, i) => routeUsing(`r${i}`, `R${i}`, "en", "s"));
    const { fetch } = fakeApi({ routes: many, images: [] });
    const result = await callTool(await connect(fetch), "list_image_slugs");
    const s = result.structuredContent as { scanned_routes: number; truncated: boolean };
    expect(s.scanned_routes).toBe(MAX_SCANNED_ROUTES);
    expect(s.truncated).toBe(true);
    expect(textOf(result)).toContain("may be incomplete");
  });
});
