import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DOC_RESOURCES } from "../resources.js";
import { ROUTE_ID, STAGING_KEY, connect, fakeFetch, json, routeDetail, testConfig } from "./helpers.js";

const DOC_NAMES = Object.keys(DOC_RESOURCES).sort();

async function readText(client: Client, uri: string): Promise<string> {
  const { contents } = await client.readResource({ uri });
  const first = contents[0];
  if (!first || !("text" in first)) throw new Error(`${uri} returned no text`);
  return first.text;
}

describe("doc resources", () => {
  it("lists every authoring doc as text/markdown", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { resources } = await client.listResources();
    const docs = resources.filter((r) => r.uri.startsWith("cityroam://docs/"));
    expect(docs.map((r) => r.uri.replace("cityroam://docs/", "")).sort()).toEqual(DOC_NAMES);
    expect(DOC_NAMES).toEqual(["api-reference", "content-guide", "data-model", "guide-personality", "translation-guide"]);
    for (const doc of docs) expect(doc.mimeType).toBe("text/markdown");
  });

  it.each(DOC_NAMES)("reads %s from the repo docs dir", async (name) => {
    const config = testConfig();
    const client = await connect(config, fakeFetch(() => json({})).fetch);
    const { contents } = await client.readResource({ uri: `cityroam://docs/${name}` });
    const onDisk = await readFile(path.join(config.docsDir, `${name}.md`), "utf8");
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ uri: `cityroam://docs/${name}`, mimeType: "text/markdown", text: onDisk });
    expect(onDisk.length).toBeGreaterThan(100);
  });

  it("reads at request time from CITYROAM_DOCS_DIR", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cityroam-docs-"));
    await writeFile(path.join(dir, "content-guide.md"), "# v1");
    const client = await connect(testConfig({ docsDir: dir }), fakeFetch(() => json({})).fetch);
    expect(await readText(client, "cityroam://docs/content-guide")).toBe("# v1");
    await writeFile(path.join(dir, "content-guide.md"), "# v2");
    expect(await readText(client, "cityroam://docs/content-guide")).toBe("# v2");
    await expect(client.readResource({ uri: "cityroam://docs/data-model" })).rejects.toThrow(/CITYROAM_DOCS_DIR/);
  });
});

describe("route resource template", () => {
  it("is listed as cityroam://routes/{route_id}", async () => {
    const client = await connect(testConfig(), fakeFetch(() => json({})).fetch);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual(["cityroam://routes/{route_id}"]);
  });

  it("returns the route as compact JSON from GET /admin/routes/:id", async () => {
    const { fetch, calls } = fakeFetch(() => json(routeDetail()));
    const client = await connect(testConfig(), fetch);
    const { contents } = await client.readResource({ uri: `cityroam://routes/${ROUTE_ID}` });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe(`/admin/routes/${ROUTE_ID}`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${STAGING_KEY}`);
    expect(contents[0].mimeType).toBe("application/json");
    const text = await readText(client, `cityroam://routes/${ROUTE_ID}`);
    expect(text).not.toContain("\n");
    expect(JSON.parse(text)).toEqual(routeDetail());
  });
});
