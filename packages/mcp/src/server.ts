import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient, type FetchLike } from "./client/http.js";
import type { Config } from "./config.js";
import { registerResources } from "./resources.js";
import { registerReadTools } from "./tools/read.js";

export const SERVER_NAME = "cityroam";
export const SERVER_VERSION = "0.1.0";

export interface CreateServerOptions {
  /** Injected for tests so the 429 retry does not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** Builds the MCP server. `fetchImpl` is injectable so tests never touch the network. */
export function createServer(config: Config, fetchImpl: FetchLike = fetch, options: CreateServerOptions = {}): McpServer {
  const http = new HttpClient({ baseUrl: config.apiUrl, apiKey: config.apiKey, fetchImpl, sleep: options.sleep });
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        `City Roam route authoring, pinned to the ${config.env} environment (${config.apiUrl}). ` +
        "Every tool result starts with the environment tag. Read the cityroam://docs/* resources " +
        "(api-reference, content-guide, guide-personality, data-model) before authoring a route, and " +
        "run validate_route on drafts.",
    },
  );
  const ctx = { config, http };
  registerReadTools(server, ctx);
  registerResources(server, ctx);
  return server;
}
