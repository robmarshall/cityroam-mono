import type { AdminApiKey } from "@cityroam/shared/types";
import {
  ADMIN_API_KEY_EXPIRY_DAYS,
  ADMIN_API_KEY_GRANTABLE_SCOPES,
  type AdminApiKeyScope,
} from "@cityroam/shared/constants";
import type { AdminApiKeyCreateInput } from "./api";

// ---------------------------------------------------------------------------
// Key status
// ---------------------------------------------------------------------------

export type ApiKeyStatus = "active" | "revoked" | "expired";

export function apiKeyStatus(key: Pick<AdminApiKey, "revoked_at" | "expires_at">, now = new Date()): ApiKeyStatus {
  if (key.revoked_at) return "revoked";
  if (key.expires_at && new Date(key.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}

export const API_KEY_STATUS_LABELS: Record<ApiKeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};

export const API_KEY_STATUS_COLORS: Record<ApiKeyStatus, string> = {
  active: "bg-green-100 text-green-700",
  revoked: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-600",
};

// ---------------------------------------------------------------------------
// Scopes and expiry offered by the "New key" form
// ---------------------------------------------------------------------------

/** routes:publish is never offered: activating a route is human-only. */
export const OFFERED_SCOPES: readonly AdminApiKeyScope[] = ADMIN_API_KEY_GRANTABLE_SCOPES;

export const SCOPE_DESCRIPTIONS: Partial<Record<AdminApiKeyScope, string>> = {
  "routes:read": "Read route families, route facts, routes, groups and blocks",
  "routes:write": "Create and edit routes, route facts, groups and blocks (never activate)",
  "images:read": "Resolve route image slugs",
  "images:write": "Upload route images",
  "message-banks:read": "Read message bank entries",
  "message-banks:write": "Create and edit message bank entries",
};

export type ExpiryChoice = "30" | "90" | "365" | "never";

export const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string }[] = [
  ...ADMIN_API_KEY_EXPIRY_DAYS.map((days) => ({
    value: String(days) as ExpiryChoice,
    label: `${days} days`,
  })),
  { value: "never", label: "Never" },
];

// ---------------------------------------------------------------------------
// Form state: edits only change local state. Nothing is sent until Save.
// ---------------------------------------------------------------------------

export interface NewKeyFormState {
  name: string;
  scopes: AdminApiKeyScope[];
  expiry: ExpiryChoice;
}

export const INITIAL_NEW_KEY_FORM: NewKeyFormState = {
  name: "",
  scopes: ["routes:read"],
  expiry: "90",
};

export type NewKeyFormAction =
  | { type: "setName"; name: string }
  | { type: "toggleScope"; scope: AdminApiKeyScope }
  | { type: "setExpiry"; expiry: ExpiryChoice }
  | { type: "reset" };

export function newKeyFormReducer(state: NewKeyFormState, action: NewKeyFormAction): NewKeyFormState {
  switch (action.type) {
    case "setName":
      return { ...state, name: action.name };
    case "toggleScope": {
      // A scope the form does not offer cannot be switched on.
      if (!OFFERED_SCOPES.includes(action.scope)) return state;
      const has = state.scopes.includes(action.scope);
      const scopes = has
        ? state.scopes.filter((s) => s !== action.scope)
        : OFFERED_SCOPES.filter((s) => s === action.scope || state.scopes.includes(s));
      return { ...state, scopes };
    }
    case "setExpiry":
      return { ...state, expiry: action.expiry };
    case "reset":
      return INITIAL_NEW_KEY_FORM;
  }
}

/** Validates the form; returns the request body or an error message. */
export function buildCreatePayload(
  state: NewKeyFormState,
): { ok: true; payload: AdminApiKeyCreateInput } | { ok: false; error: string } {
  const name = state.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 100) return { ok: false, error: "Name must be at most 100 characters." };
  const scopes = state.scopes.filter((s) => OFFERED_SCOPES.includes(s));
  if (scopes.length === 0) return { ok: false, error: "Pick at least one scope." };
  return {
    ok: true,
    payload: {
      name,
      scopes,
      expires_in_days: state.expiry === "never" ? null : Number(state.expiry),
    },
  };
}
