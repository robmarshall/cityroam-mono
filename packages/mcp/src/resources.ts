import { readFile } from "node:fs/promises";
import path from "node:path";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdminRouteDetailResponse } from "@cityroam/shared/types";
import type { ToolContext } from "./tools/context.js";

/** The authoring docs exposed as `cityroam://docs/<name>`. */
export const DOC_RESOURCES = {
  "api-reference": "Admin API endpoints, auth, request and response formats",
  "content-guide": "How to write clues, hints, directions and fun facts",
  "guide-personality": "The guide's tone, message bank types and examples",
  "data-model": "Entity relationships, AI pipeline behaviour, answer matching rules",
  "translation-guide": "How to translate a route into a sibling language variant",
} as const;

export type DocName = keyof typeof DOC_RESOURCES;

export function docUri(name: DocName): string {
  return `cityroam://docs/${name}`;
}

export function registerResources(server: McpServer, ctx: ToolContext): void {
  const { config, http } = ctx;

  for (const [name, description] of Object.entries(DOC_RESOURCES) as [DocName, string][]) {
    server.registerResource(
      `doc-${name}`,
      docUri(name),
      { title: `${name}.md`, description, mimeType: "text/markdown" },
      async (uri) => {
        // Read at request time so doc edits show up without a restart.
        const file = path.join(config.docsDir, `${name}.md`);
        let text: string;
        try {
          text = await readFile(file, "utf8");
        } catch {
          throw new Error(`Doc ${name}.md not found in ${config.docsDir} (set CITYROAM_DOCS_DIR to the docs/llm-authoring directory).`);
        }
        return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
      },
    );
  }

  server.registerResource(
    "route",
    new ResourceTemplate("cityroam://routes/{route_id}", { list: undefined }),
    {
      title: "Route",
      description: `A route with its groups and blocks, as compact JSON (GET /admin/routes/:id on ${config.env}).`,
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const raw = variables.route_id;
      const routeId = Array.isArray(raw) ? raw[0] : raw;
      if (!routeId) throw new Error("Route resource URI needs a route id: cityroam://routes/{route_id}");
      const { data } = await http.get<AdminRouteDetailResponse>(`/admin/routes/${encodeURIComponent(routeId)}`);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data) }] };
    },
  );
}
