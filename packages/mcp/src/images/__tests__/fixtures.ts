import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HttpClient, type FetchLike } from "../../client/http.js";
import type { Config } from "../../config.js";
import type { ToolContext } from "../../tools/context.js";

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

export interface RawCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  /** String bodies as-is; binary bodies as bytes. */
  body?: string | Uint8Array;
}

/** Like helpers.fakeFetch, but keeps binary (PUT) bodies too. */
export function recordingFetch(responder: (call: RawCall) => Response | Promise<Response>): {
  fetch: FetchLike;
  calls: RawCall[];
} {
  const calls: RawCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const raw = init?.body;
    const body =
      typeof raw === "string" ? raw : raw instanceof Uint8Array ? new Uint8Array(raw) : raw == null ? undefined : String(raw);
    const call: RawCall = { method: init?.method ?? "GET", url: new URL(input), headers, body };
    calls.push(call);
    return responder(call);
  };
  return { fetch, calls };
}

/** A fresh McpServer with only the given registrations, connected to an SDK client. */
export async function connectWith(
  config: Config,
  fetch: FetchLike,
  register: (server: McpServer, ctx: ToolContext) => void,
): Promise<Client> {
  const http = new HttpClient({ baseUrl: config.apiUrl, apiKey: config.apiKey, fetchImpl: fetch, sleep: async () => {} });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  register(server, { config, http });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}
