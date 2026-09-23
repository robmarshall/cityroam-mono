import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient, type FetchLike } from "./client/http.js";
import type { Config } from "./config.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerImageTools } from "./tools/images.js";
import { registerMessageBankTools } from "./tools/message-banks.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

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
        "run validate_route on drafts (the author_route and translate_route prompts walk through the workflow). Write tools accept dry_run to preview; routes are always created inactive, " +
        "and changes to an ACTIVE route need confirm_live: true.",
    },
  );
  const ctx = { config, http };
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  // The injected fetch covers the presigned S3 PUT and URL downloads too, so tests never hit the network.
  registerImageTools(server, ctx, { fetchImpl });
  registerMessageBankTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, config);
  return server;
}
