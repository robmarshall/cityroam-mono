import type {
  AdminApiKeyCreateResponse,
  AdminApiKeyListResponse,
  AdminApiKeyRevokeResponse,
  AdminAuditLogResponse,
  ApiErrorResponse,
} from "@cityroam/shared/types";
import type { AdminApiKeyScope } from "@cityroam/shared/constants";

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
// Token helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = "cityroam_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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

function buildHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
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

  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PUT", path, body);
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body);
  },

  delete<T>(path: string): Promise<T> {
    return request<T>("DELETE", path);
  },

  /** Admin API keys (session-only endpoints). */
  apiKeys: {
    list(): Promise<AdminApiKeyListResponse> {
      return request<AdminApiKeyListResponse>("GET", "/admin/api-keys");
    },

    /** The response carries the full token: the only time it is ever shown. */
    create(input: AdminApiKeyCreateInput): Promise<AdminApiKeyCreateResponse> {
      return request<AdminApiKeyCreateResponse>("POST", "/admin/api-keys", input);
    },

    revoke(id: string): Promise<AdminApiKeyRevokeResponse> {
      return request<AdminApiKeyRevokeResponse>(
        "POST",
        `/admin/api-keys/${encodeURIComponent(id)}/revoke`,
      );
    },
  },

  /** Admin audit log, newest first (session-only). */
  auditLog: {
    list(
      params: { actor_id?: string; limit?: number; offset?: number } = {},
    ): Promise<AdminAuditLogResponse> {
      const query = new URLSearchParams();
      if (params.actor_id) query.set("actor_id", params.actor_id);
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      if (params.offset !== undefined) query.set("offset", String(params.offset));
      const qs = query.toString();
      return request<AdminAuditLogResponse>("GET", `/admin/audit-log${qs ? `?${qs}` : ""}`);
    },
  },
} as const;

export interface AdminApiKeyCreateInput {
  name: string;
  scopes: AdminApiKeyScope[];
  /** 30, 90 or 365; null or omitted for a key that never expires. */
  expires_in_days?: number | null;
}
