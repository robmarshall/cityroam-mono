import { useCallback, useEffect, useReducer, useState } from "react";
import type { AdminApiKey, AdminAuditLogEntry } from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { formatDate } from "../lib/event-utils";
import {
  apiKeyStatus,
  API_KEY_STATUS_COLORS,
  API_KEY_STATUS_LABELS,
  buildCreatePayload,
  EXPIRY_OPTIONS,
  INITIAL_NEW_KEY_FORM,
  newKeyFormReducer,
  OFFERED_SCOPES,
  SCOPE_DESCRIPTIONS,
  type ExpiryChoice,
  type NewKeyFormAction,
  type NewKeyFormState,
} from "../lib/api-key-form";

const INPUT_CLS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const BTN_PRIMARY =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const BTN_SECONDARY =
  "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const BTN_DANGER =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

const ACTIVITY_LIMIT = 20;

function errorMessage(err: unknown, fallback: string): string | null {
  if (err instanceof ApiError) return err.status === 401 ? null : err.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// New key form (modal). Edits stay local; only the Save button submits.
// ---------------------------------------------------------------------------

export interface NewKeyFormProps {
  state: NewKeyFormState;
  dispatch: (action: NewKeyFormAction) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

export function NewKeyForm({ state, dispatch, onSave, onCancel, saving, error }: NewKeyFormProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">New API key</h2>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
        )}

        {/* No <form>: Enter in the name field must not submit. Save is the only way. */}
        <div className="mb-4">
          <label htmlFor="api-key-name" className="mb-1 block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="api-key-name"
            type="text"
            value={state.name}
            maxLength={100}
            placeholder="e.g. Claude Code (staging)"
            onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
            className={INPUT_CLS}
          />
        </div>

        <fieldset className="mb-4">
          <legend className="mb-1 block text-sm font-medium text-gray-700">Scopes</legend>
          <div className="space-y-2">
            {OFFERED_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  checked={state.scopes.includes(scope)}
                  onChange={() => dispatch({ type: "toggleScope", scope })}
                  className="mt-0.5"
                />
                <span>
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono">{scope}</code>
                  {SCOPE_DESCRIPTIONS[scope] && (
                    <span className="ml-2 text-gray-500">{SCOPE_DESCRIPTIONS[scope]}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Keys can never activate a route. Making a route live stays a signed-in admin action.
          </p>
        </fieldset>

        <div className="mb-6">
          <label htmlFor="api-key-expiry" className="mb-1 block text-sm font-medium text-gray-700">
            Expires after
          </label>
          <select
            id="api-key-expiry"
            value={state.expiry}
            onChange={(e) => dispatch({ type: "setExpiry", expiry: e.target.value as ExpiryChoice })}
            className={INPUT_CLS}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One-time token display
// ---------------------------------------------------------------------------

function TokenResultModal({ keyName, token, onClose }: { keyName: string; token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [stored, setStored] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">API key created</h2>
        <p className="mb-4 text-sm text-gray-600">
          This is the only time the token for <span className="font-medium">{keyName}</span> is
          shown. Copy it into your MCP client configuration or a password manager now. It cannot be
          retrieved later; if you lose it, revoke the key and create a new one.
        </p>

        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-amber-900">{token}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-300"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <label className="mb-6 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} />
          I&apos;ve stored this token somewhere safe
        </label>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={!stored} className={BTN_PRIMARY}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-key recent activity from the audit log
// ---------------------------------------------------------------------------

function KeyActivity({ keyId }: { keyId: string }) {
  const authFetch = useAuthFetch();
  const [entries, setEntries] = useState<AdminAuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch(() => api.auditLog.list({ actor_id: keyId, limit: ACTIVITY_LIMIT }))
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Failed to load activity."));
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch, keyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!entries) return <p className="text-sm text-gray-500">Loading activity...</p>;
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No changes recorded for this key yet.</p>;
  }

  return (
    <table className="w-full text-left text-xs">
      <thead className="text-gray-500">
        <tr>
          <th className="py-1 pr-3 font-medium">When</th>
          <th className="py-1 pr-3 font-medium">Request</th>
          <th className="py-1 pr-3 font-medium">Status</th>
          <th className="py-1 font-medium">IP</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} className="border-t border-gray-100">
            <td className="py-1 pr-3 text-gray-600">{formatDate(entry.created_at)}</td>
            <td className="py-1 pr-3 font-mono text-gray-800">
              {entry.method} {entry.path}
            </td>
            <td className={`py-1 pr-3 ${entry.status >= 400 ? "text-red-600" : "text-gray-700"}`}>
              {entry.status}
            </td>
            <td className="py-1 text-gray-600">{entry.ip ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApiKeysPage() {
  const authFetch = useAuthFetch();
  const [keys, setKeys] = useState<AdminApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, dispatch] = useReducer(newKeyFormReducer, INITIAL_NEW_KEY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<AdminApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [activityKeyId, setActivityKeyId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() => api.apiKeys.list());
      setKeys(res.api_keys);
    } catch (err) {
      const msg = errorMessage(err, "Failed to load API keys.");
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const openForm = () => {
    dispatch({ type: "reset" });
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    const built = buildCreatePayload(form);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await authFetch(() => api.apiKeys.create(built.payload));
      setShowForm(false);
      dispatch({ type: "reset" });
      setCreated({ name: res.api_key.name, token: res.token });
      setKeys((prev) => [res.api_key, ...prev]);
    } catch (err) {
      const msg = errorMessage(err, "An unexpected error occurred.");
      if (msg) setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await authFetch(() => api.apiKeys.revoke(revokeTarget.id));
      setKeys((prev) => prev.map((k) => (k.id === res.api_key.id ? res.api_key : k)));
      setRevokeTarget(null);
    } catch (err) {
      const msg = errorMessage(err, "Failed to revoke the key.");
      if (msg) setRevokeError(msg);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <button type="button" onClick={openForm} className={BTN_PRIMARY}>
          New key
        </button>
      </div>
      <p className="mb-6 max-w-3xl text-sm text-gray-600">
        Scoped keys for the route-authoring MCP server. A key can read and edit routes, images and
        message banks within its scopes, but can never activate a route, touch events or refunds, or
        manage keys. Every change a key makes is recorded below.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={fetchKeys} className="ml-2 font-medium underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">Loading API keys...</div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-gray-500">No API keys yet. Click "New key" to create one.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Scopes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const status = apiKeyStatus(key);
                const showActivity = activityKeyId === key.id;
                return (
                  <KeyRows
                    key={key.id}
                    apiKey={key}
                    status={status}
                    showActivity={showActivity}
                    onToggleActivity={() => setActivityKeyId(showActivity ? null : key.id)}
                    onRevoke={() => {
                      setRevokeError(null);
                      setRevokeTarget(key);
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <NewKeyForm
          state={form}
          dispatch={dispatch}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setFormError(null);
          }}
          saving={saving}
          error={formError}
        />
      )}

      {created && (
        <TokenResultModal keyName={created.name} token={created.token} onClose={() => setCreated(null)} />
      )}

      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Revoke API key</h3>
            <p className="mb-4 text-sm text-gray-600">
              Revoke <span className="font-medium">{revokeTarget.name}</span> (
              <span className="font-mono">
                {revokeTarget.prefix}…{revokeTarget.last4}
              </span>
              )? Anything using it stops working immediately. This cannot be undone.
            </p>
            {revokeError && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{revokeError}</div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRevokeTarget(null);
                  setRevokeError(null);
                }}
                disabled={revoking}
                className={BTN_SECONDARY}
              >
                Cancel
              </button>
              <button type="button" onClick={handleRevoke} disabled={revoking} className={BTN_DANGER}>
                {revoking ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyRows({
  apiKey,
  status,
  showActivity,
  onToggleActivity,
  onRevoke,
}: {
  apiKey: AdminApiKey;
  status: ReturnType<typeof apiKeyStatus>;
  showActivity: boolean;
  onToggleActivity: () => void;
  onRevoke: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 align-top last:border-0">
        <td className="px-4 py-3 font-medium text-gray-900">{apiKey.name}</td>
        <td className="px-4 py-3 font-mono text-xs text-gray-600">
          {apiKey.prefix}…{apiKey.last4}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {apiKey.scopes.map((scope) => (
              <code key={scope} className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono text-gray-700">
                {scope}
              </code>
            ))}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${API_KEY_STATUS_COLORS[status]}`}>
            {API_KEY_STATUS_LABELS[status]}
          </span>
          {apiKey.revoked_at && (
            <div className="mt-1 text-xs text-gray-500">
              {formatDate(apiKey.revoked_at)}
              {apiKey.revoked_by ? ` by ${apiKey.revoked_by}` : ""}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {formatDate(apiKey.created_at)}
          <div className="text-gray-400">by {apiKey.created_by}</div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {apiKey.expires_at ? formatDate(apiKey.expires_at) : "Never"}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {apiKey.last_used_at ? (
            <>
              {formatDate(apiKey.last_used_at)}
              {apiKey.last_used_ip && <div className="text-gray-400">{apiKey.last_used_ip}</div>}
            </>
          ) : (
            "Never"
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggleActivity}
            className="rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
          >
            {showActivity ? "Hide activity" : "Activity"}
          </button>
          {status !== "revoked" && (
            <button
              type="button"
              onClick={onRevoke}
              className="ml-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Revoke
            </button>
          )}
        </td>
      </tr>
      {showActivity && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={8} className="px-4 py-3">
            <KeyActivity keyId={apiKey.id} />
          </td>
        </tr>
      )}
    </>
  );
}
