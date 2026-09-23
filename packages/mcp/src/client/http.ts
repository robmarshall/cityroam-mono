/**
 * Typed client for the City Roam admin HTTP API.
 *
 * Authenticates with the admin API key as a Bearer token. The key is only
 * ever placed in the Authorization header — it is never logged or included
 * in an error message.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const REQUEST_TIMEOUT_MS = 20_000;
/** Longest `Retry-After` the client will wait before its one retry. */
export const MAX_RETRY_AFTER_MS = 30_000;

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when no response was received. */
    public readonly status: number,
    /** The API's `code` (e.g. `ROUTE_NOT_FOUND`), or a local one (`TIMEOUT`, `NETWORK_ERROR`, `HTTP_502`). */
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  /**
   * Value of the `X-Live-Events` header: the number of live events on the
   * route a content edit touched. Undefined when the header is absent.
   */
  liveEvents?: number;
}

export type Query = Record<string, string | number | boolean | undefined>;

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Parses `Retry-After` (delta-seconds or an HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds * 1000), MAX_RETRY_AFTER_MS);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - now), MAX_RETRY_AFTER_MS);
  return 1000;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  get<T>(path: string, query?: Query): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, { query });
  }

  post<T>(path: string, body?: unknown, query?: Query): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, { body, query });
  }

  put<T>(path: string, body?: unknown, query?: Query): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, { body, query });
  }

  delete<T>(path: string, query?: Query): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, { query });
  }

  buildUrl(path: string, query?: Query): string {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; query?: Query } = {},
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let response = await this.send(url, { method, headers, body });
    if (response.status === 429) {
      await this.sleep(parseRetryAfter(response.headers.get("Retry-After")));
      response = await this.send(url, { method, headers, body });
    }

    const text = await response.text();
    const parsed = parseJson(text);

    if (!response.ok) {
      throw toApiError(response.status, parsed, text);
    }

    const live = response.headers.get("X-Live-Events");
    const liveEvents = live !== null && live.trim() !== "" && Number.isFinite(Number(live)) ? Number(live) : undefined;

    return { data: parsed as T, status: response.status, liveEvents };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ApiError(0, "TIMEOUT", `Request to ${redactUrl(url)} timed out after ${this.timeoutMs / 1000}s`);
      }
      const reason = err instanceof Error ? err.message : String(err);
      throw new ApiError(0, "NETWORK_ERROR", `Could not reach ${redactUrl(url)}: ${reason}`);
    }
  }
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toApiError(status: number, parsed: unknown, text: string): ApiError {
  if (parsed && typeof parsed === "object") {
    const { error, code } = parsed as { error?: unknown; code?: unknown };
    if (typeof error === "string" || typeof code === "string") {
      return new ApiError(
        status,
        typeof code === "string" ? code : `HTTP_${status}`,
        typeof error === "string" ? error : `HTTP ${status}`,
      );
    }
  }
  const snippet = text.trim().slice(0, 200);
  return new ApiError(status, `HTTP_${status}`, snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`);
}

/** Origin + path only — query strings never reach error messages. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "the City Roam API";
  }
}
