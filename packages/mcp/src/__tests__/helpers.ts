import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AdminRouteDetailResponse } from "@cityroam/shared/types";
import type { FetchLike } from "../client/http.js";
import { loadConfig, type Config } from "../config.js";
import { createServer } from "../server.js";

export const STAGING_KEY = "crk_stg_0123456789abcdefghijkl_" + "s".repeat(43);

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ CITYROAM_ENV: "staging", CITYROAM_API_KEY_STAGING: STAGING_KEY }),
    ...overrides,
  };
}

export interface RecordedCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}

export type Responder = (call: RecordedCall) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** A fetch that records every call and answers from `responder`. */
export function fakeFetch(responder: Responder): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: RecordedCall = {
      method: init?.method ?? "GET",
      url: new URL(input),
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return responder(call);
  };
  return { fetch, calls };
}

export async function connect(config: Config, fetch: FetchLike): Promise<Client> {
  const server = createServer(config, fetch, { sleep: async () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

export function textOf(result: CallToolResult): string {
  return result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
}

const ts = "2026-09-01T00:00:00.000Z";

export const ROUTE_ID = "11111111-1111-4111-8111-111111111111";
export const FAMILY_ID = "22222222-2222-4222-8222-222222222222";

export function routeDetail(): AdminRouteDetailResponse {
  const group = (id: string, position: number, name: string) => ({
    id,
    route_id: ROUTE_ID,
    position,
    name,
    created_at: ts,
    updated_at: ts,
  });
  return {
    route: {
      id: ROUTE_ID,
      name: "Leeds City Centre Discovery",
      description: "A walk through Leeds.",
      language: "en",
      route_family_id: FAMILY_ID,
      total_stops: 1,
      estimated_duration_mins: 60,
      estimated_distance_km: 2.5,
      is_active: false,
      created_at: ts,
      updated_at: ts,
    },
    route_family: { id: FAMILY_ID, name: "Leeds", city: "Leeds", created_at: ts, updated_at: ts },
    groups: [
      {
        ...group("g1", 0, "Introduction"),
        blocks: [
          {
            id: "b1",
            group_id: "g1",
            position: 0,
            type: "message",
            config: { type: "message", content: "Right then. Welcome to {{CITY_NAME}}. ".repeat(5) },
            delay_ms: 0,
            created_at: ts,
          },
        ],
      },
      {
        ...group("g2", 1, "Leeds Town Hall"),
        blocks: [
          {
            id: "b2",
            group_id: "g2",
            position: 0,
            type: "question",
            config: {
              type: "question",
              clue: "I stand with columns tall and proud, where justice once was served aloud.",
              accepted_answers: ["Leeds Town Hall", "Town Hall"],
              hints: [
                [{ content: "Think civic buildings.", image_url: null, delay_ms: 0 }],
                [{ content: "It's on The Headrow.", image_url: null, delay_ms: 0 }],
              ],
            },
            delay_ms: 0,
            created_at: ts,
          },
        ],
      },
    ],
  } as AdminRouteDetailResponse;
}
