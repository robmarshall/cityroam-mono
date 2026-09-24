import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JPEG, recordingFetch } from "../images/__tests__/fixtures.js";
import { AUTHORING_DOCS } from "../prompts.js";
import { connect, fakeFetch, json, testConfig, textOf } from "./helpers.js";

let docsDir: string;

beforeAll(async () => {
  docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "cityroam-mcp-prompts-"));
  for (const name of [...AUTHORING_DOCS, "translation-guide"]) {
    await fs.writeFile(path.join(docsDir, `${name}.md`), `# ${name} body`);
  }
});

afterAll(async () => {
  await fs.rm(docsDir, { recursive: true, force: true });
});

const client = () => connect(testConfig({ docsDir }), fakeFetch(() => json({})).fetch);

function firstText(result: GetPromptResult): string {
  const c = result.messages[0].content;
  return c.type === "text" ? c.text : "";
}

describe("prompts", () => {
  it("lists author_route and translate_route with their arguments", async () => {
    const { prompts } = await (await client()).listPrompts();
    const byName = Object.fromEntries(prompts.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(["author_route", "translate_route"]);
    const args = (name: string) => byName[name].arguments!.map((a) => `${a.name}${a.required ? "!" : "?"}`).sort();
    expect(args("author_route")).toEqual(["city!", "language?", "stops?", "theme?"]);
    expect(args("translate_route")).toEqual(["route_id!", "target_language!"]);
  });

  it("author_route embeds the four authoring docs and walks the full workflow in order", async () => {
    const result = await (await client()).getPrompt({
      name: "author_route",
      arguments: { city: "York", theme: "Viking history", stops: "7", language: "fr" },
    });
    const text = firstText(result);
    expect(text).toContain('in York with the theme "Viking history", with 7 stops, in language "fr"');
    expect(text).toContain("pinned to staging");
    const steps = ["validate_route", "create_route with dry_run: true", "create_route for real", "list_image_slugs", "upload_image"];
    const positions = steps.map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0), JSON.stringify(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain("created inactive");
    expect(text).toMatch(/activates it in the admin UI/);
    expect(text).toContain("The guide is the Owl");
    expect(text).toContain('"Le Hibou"');
    expect(text).toContain("{{GUIDE_NAME}}");
    expect(text).toContain("no owl puns");

    const embedded = result.messages.slice(1).map((m) => m.content);
    expect(embedded).toHaveLength(4);
    for (const [i, name] of AUTHORING_DOCS.entries()) {
      expect(embedded[i]).toEqual({
        type: "resource",
        resource: { uri: `cityroam://docs/${name}`, mimeType: "text/markdown", text: `# ${name} body` },
      });
    }
  });

  it("author_route defaults the language to en and rejects bad arguments", async () => {
    const c = await client();
    const result = await c.getPrompt({ name: "author_route", arguments: { city: "Leeds" } });
    expect(firstText(result)).toContain('in language "en"');
    await expect(c.getPrompt({ name: "author_route", arguments: { city: "Leeds", language: "it" } })).rejects.toThrow(/language must be one of/);
    await expect(c.getPrompt({ name: "author_route", arguments: { city: "Leeds", stops: "lots" } })).rejects.toThrow(/stops must be/);
  });

  it("author_route falls back to resource links when the docs cannot be read", async () => {
    const c = await connect(testConfig({ docsDir: path.join(docsDir, "missing") }), fakeFetch(() => json({})).fetch);
    const result = await c.getPrompt({ name: "author_route", arguments: { city: "Leeds" } });
    for (const m of result.messages.slice(1)) {
      expect(m.content).toMatchObject({ type: "resource_link", mimeType: "text/markdown" });
    }
  });

  it("warns in the prompt when pinned to production", async () => {
    const c = await connect(testConfig({ docsDir, env: "production", apiUrl: "https://api.cityroam.co.uk" }), fakeFetch(() => json({})).fetch);
    const result = await c.getPrompt({ name: "author_route", arguments: { city: "Leeds" } });
    expect(firstText(result)).toContain("pinned to PRODUCTION");
    expect(firstText(result)).toContain("explicitly asked for production");
  });

  it("translate_route embeds translation-guide.md and the sibling-variant workflow", async () => {
    const result = await (await client()).getPrompt({
      name: "translate_route",
      arguments: { route_id: "r-123", target_language: "ES" },
    });
    const text = firstText(result);
    expect(text).toContain('Translate City Roam route r-123 into "es"');
    expect(text).toContain('{{GUIDE_NAME}} becomes "El Búho"');
    expect(text).toContain("grammatical gender");
    for (const step of ['get_route with route_id "r-123"', "get_route_family", "route_family_id", "validate_route", "create_route with dry_run: true", 'list_message_banks with language "es"', "list_image_slugs"]) {
      expect(text, step).toContain(step);
    }
    expect(text).toContain("created inactive");
    expect(result.messages[1].content).toEqual({
      type: "resource",
      resource: { uri: "cityroam://docs/translation-guide", mimeType: "text/markdown", text: "# translation-guide body" },
    });
    expect(result.messages.slice(2).map((m) => (m.content as { uri: string }).uri)).toEqual([
      "cityroam://docs/content-guide",
      "cityroam://docs/guide-personality",
    ]);
    await expect(
      (await client()).getPrompt({ name: "translate_route", arguments: { route_id: "r-1", target_language: "xx" } }),
    ).rejects.toThrow(/target_language must be one of/);
  });
});

describe("server wiring", () => {
  it("gives upload_image the injected fetch, so URL downloads never hit the network", async () => {
    const { fetch, calls } = recordingFetch((call) => {
      if (call.url.hostname === "photos.example.com") {
        return new Response(JPEG, { headers: { "Content-Type": "image/jpeg" } });
      }
      return json({ slug: "leeds-town-hall", key: "route-images/leeds-town-hall.jpg", url: null, exists: false, size: null, last_modified: null });
    });
    const c = await connect(testConfig(), fetch);
    const result = await c.callTool({
      name: "upload_image",
      arguments: { source: { url: "https://photos.example.com/th.jpg" }, slug: "leeds-town-hall", dry_run: true },
    });
    expect(result.isError, textOf(result as never)).toBeFalsy();
    expect(calls.map((c) => `${c.method} ${c.url.href}`)).toEqual([
      "GET https://photos.example.com/th.jpg",
      "GET https://api-staging.cityroam.co.uk/admin/route-images/leeds-town-hall",
    ]);
  });

  it("serves the message bank write tools through createServer", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const c = await connect(testConfig(), fetch);
    const result = await c.callTool({
      name: "create_message_bank_entry",
      arguments: { type: "success", language: "en", content: "Spot on.", is_active: true, dry_run: true },
    });
    expect(result.isError, textOf(result as never)).toBeFalsy();
    expect(calls).toHaveLength(0);
  });
});
