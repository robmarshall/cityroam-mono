import type { ApiErrorResponse } from "@cityroam/shared/types";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly response?: ApiErrorResponse;

  constructor(status: number, body?: ApiErrorResponse) {
    super(body?.error ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.response = body;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiErrorResponse | undefined;
    try {
      body = (await res.json()) as ApiErrorResponse;
    } catch {
      // Response body is not JSON — leave body undefined
    }
    throw new ApiError(res.status, body);
  }

  // 204 No Content — return undefined cast as T
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function buildHeaders(hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const hasBody = body !== undefined;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders(hasBody),
    credentials: "include",
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(res);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body);
  },

  delete<T>(path: string): Promise<T> {
    return request<T>("DELETE", path);
  },
} as const;
