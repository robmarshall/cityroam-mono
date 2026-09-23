import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiError } from "./client/http.js";
import { ENV_TAGS, type CityRoamEnv } from "./config.js";

/**
 * Tool result helpers. Every result's text starts with the environment tag
 * (`[staging]`, `[PRODUCTION]`, `[local]`) so the transcript always shows
 * which environment a call ran against.
 */

export function tag(env: CityRoamEnv, text: string): string {
  return `${ENV_TAGS[env]} ${text}`;
}

export function liveEventsWarning(liveEvents: number | undefined): string | undefined {
  if (!liveEvents) return undefined;
  return `Warning: this route has ${liveEvents} live event${liveEvents === 1 ? "" : "s"} in progress — players may see the change.`;
}

export function okResult(
  env: CityRoamEnv,
  text: string,
  options: { structured?: Record<string, unknown>; liveEvents?: number } = {},
): CallToolResult {
  const warning = liveEventsWarning(options.liveEvents);
  const result: CallToolResult = {
    content: [{ type: "text", text: tag(env, warning ? `${warning}\n${text}` : text) }],
  };
  if (options.structured) result.structuredContent = options.structured;
  return result;
}

/** A failure the model should see and can act on (never a thrown protocol error). */
export function errorResult(env: CityRoamEnv, text: string): CallToolResult {
  return { content: [{ type: "text", text: tag(env, text) }], isError: true };
}

/** API errors keep the API's code, status and message verbatim. */
export function apiErrorResult(env: CityRoamEnv, err: ApiError): CallToolResult {
  const status = err.status ? ` (HTTP ${err.status})` : "";
  return errorResult(env, `Error ${err.code}${status}: ${err.message}`);
}

/** Runs a tool body, turning any thrown error into an `isError` result. */
export async function guard(env: CityRoamEnv, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return apiErrorResult(env, err);
    return errorResult(env, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
