import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminMessageBankListResponse,
  MessageBankType,
  SupportedLanguage,
} from "@cityroam/shared/types";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_NAMES,
} from "@cityroam/shared/constants";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { formatDate } from "../lib/event-utils";

const BANK_TYPES: { value: MessageBankType; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "hint-exhausted", label: "Hint Exhausted" },
  { value: "hint-offer", label: "Hint Offer" },
  { value: "hint-decline", label: "Hint Decline" },
  { value: "clarification", label: "Clarification" },
  { value: "unknown-answer", label: "Unknown Answer" },
  { value: "completion", label: "Completion" },
  { value: "over-length", label: "Over-length" },
  { value: "guide-degraded", label: "Guide Degraded" },
  { value: "guide-busy", label: "Guide Busy" },
];

const TEMPLATE_VARS: Partial<Record<MessageBankType, string[]>> = {
  completion: [
    "{{TOTAL_STOPS}}",
    "{{DISTANCE_KM}}",
    "{{CITY_NAME}}",
    "{{REVIEW_LINK}}",
  ],
  "hint-exhausted": ["{{ANSWER}}"],
};

type MessageBank = AdminMessageBankListResponse["message_banks"][number];

interface FormState {
  type: MessageBankType;
  language: SupportedLanguage;
  content: string;
  is_active: boolean;
}

const MIN_ACTIVE_COUNT = 5;

export default function MessageBanksPage() {
  const [banks, setBanks] = useState<MessageBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MessageBankType>("success");
  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage | "all">("all");
  const authFetch = useAuthFetch();

  // Modal / form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    type: "success",
    language: DEFAULT_LANGUAGE,
    content: "",
    is_active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Pending active/inactive toggles (bank id -> desired is_active).
  // Nothing is persisted until Save is pressed.
  const [pendingActive, setPendingActive] = useState<Record<string, boolean>>(
    {},
  );
  const [savingToggles, setSavingToggles] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const pendingToggleIdsRef = useRef<string[]>([]);
  pendingToggleIdsRef.current = Object.keys(pendingActive);

  // Warn before a full page unload throws pending toggles away.
  useEffect(() => {
    if (Object.keys(pendingActive).length === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingActive]);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminMessageBankListResponse>("/admin/message-banks"),
      );
      setBanks(res.message_banks);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError("Failed to load message banks.");
      } else if (!(err instanceof ApiError)) {
        setError("Failed to load message banks.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const filtered = banks.filter(
    (b) =>
      b.type === activeTab &&
      (activeLanguage === "all" || b.language === activeLanguage),
  );
  // What the entry will be once pending toggles are saved.
  const effectiveActive = (b: MessageBank) => pendingActive[b.id] ?? b.is_active;
  const activeCount = filtered.filter(effectiveActive).length;

  const openCreateForm = () => {
    setEditingId(null);
    setForm({
      type: activeTab,
      language: activeLanguage === "all" ? DEFAULT_LANGUAGE : activeLanguage,
      content: "",
      is_active: true,
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (bank: MessageBank) => {
    setEditingId(bank.id);
    setForm({
      type: bank.type as MessageBankType,
      language: (bank.language as SupportedLanguage) || DEFAULT_LANGUAGE,
      content: bank.content,
      is_active: bank.is_active,
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  // Saving or deleting an entry reloads the list, which drops pending toggles.
  const confirmLosingToggles = (action: string) => {
    if (pendingToggleIdsRef.current.length === 0) return true;
    return window.confirm(
      `You have unsaved active/inactive changes. ${action} reloads the list and discards them. Continue?`,
    );
  };

  const handleSave = async () => {
    if (!form.content.trim()) {
      setFormError("Content is required.");
      return;
    }
    if (!confirmLosingToggles("Saving this entry")) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await authFetch(() =>
          api.put(`/admin/message-banks/${editingId}`, {
            type: form.type,
            language: form.language,
            content: form.content.trim(),
            is_active: form.is_active,
          }),
        );
      } else {
        await authFetch(() =>
          api.post("/admin/message-banks", {
            type: form.type,
            language: form.language,
            content: form.content.trim(),
            is_active: form.is_active,
          }),
        );
      }
      closeForm();
      await fetchBanks();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setFormError(err.message);
      } else if (!(err instanceof ApiError)) {
        setFormError("An unexpected error occurred.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirmLosingToggles("Deleting this entry")) return;
    setDeleting(true);
    try {
      await authFetch(() => api.delete(`/admin/message-banks/${id}`));
      setDeletingId(null);
      await fetchBanks();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message);
      } else if (!(err instanceof ApiError)) {
        setError("Failed to delete message bank entry.");
      }
      setDeletingId(null);
    } finally {
      setDeleting(false);
    }
  };

  // Clicking the toggle only records the intent — Save persists it.
  const handleToggleActive = (bank: MessageBank) => {
    setToggleError(null);
    setPendingActive((prev) => {
      const next = { ...prev };
      const desired = !(prev[bank.id] ?? bank.is_active);
      if (desired === bank.is_active) delete next[bank.id];
      else next[bank.id] = desired;
      return next;
    });
  };

  const pendingToggleIds = Object.keys(pendingActive);

  const handleSaveToggles = async () => {
    if (pendingToggleIds.length === 0) return;
    setSavingToggles(true);
    setToggleError(null);
    try {
      for (const bankId of pendingToggleIds) {
        const bank = banks.find((b) => b.id === bankId);
        if (!bank) continue;
        await authFetch(() =>
          api.put(`/admin/message-banks/${bankId}`, {
            type: bank.type,
            language: bank.language,
            content: bank.content,
            is_active: pendingActive[bankId],
          }),
        );
      }
      setPendingActive({});
      await fetchBanks();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setToggleError(err.message);
      } else if (!(err instanceof ApiError)) {
        setToggleError("Failed to save active/inactive changes.");
      }
    } finally {
      setSavingToggles(false);
    }
  };

  const handleCancelToggles = () => {
    setPendingActive({});
    setToggleError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading message banks...
      </div>
    );
  }

  if (error && banks.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{error}</p>
        <button
          onClick={fetchBanks}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const templateVars = TEMPLATE_VARS[activeTab];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Message Banks</h1>
        <button
          onClick={openCreateForm}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Entry
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Type tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {BANK_TYPES.map((bt) => {
          const count = banks.filter((b) => b.type === bt.value).length;
          const isActive = activeTab === bt.value;
          return (
            <button
              key={bt.value}
              onClick={() => setActiveTab(bt.value)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {bt.label}
              <span className="ml-1 text-xs text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Language filter */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Language:</span>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveLanguage("all")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeLanguage === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const langCount = banks.filter(
              (b) => b.type === activeTab && b.language === lang,
            ).length;
            return (
              <button
                key={lang}
                onClick={() => setActiveLanguage(lang)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeLanguage === lang
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {lang.toUpperCase()}
                <span className="ml-1 opacity-60">({langCount})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Low count warning */}
      {activeCount < MIN_ACTIVE_COUNT && (
        <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
          This bank has fewer than {MIN_ACTIVE_COUNT} active entries. Add more to
          reduce repetition.
        </div>
      )}

      {/* Template variable reference */}
      {templateVars && (
        <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
          <span className="font-medium">Template variables:</span>{" "}
          {templateVars.map((v, i) => (
            <span key={v}>
              <code className="rounded bg-blue-100 px-1 py-0.5 text-xs font-mono">
                {v}
              </code>
              {i < templateVars.length - 1 && ", "}
            </span>
          ))}
        </div>
      )}

      {/* Pending toggle bar */}
      {pendingToggleIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <span className="text-sm text-amber-900">
            <span className="font-medium">
              {pendingToggleIds.length} unsaved active/inactive change
              {pendingToggleIds.length !== 1 ? "s" : ""}
            </span>
            . Nothing is applied until you press Save.
          </span>
          {toggleError && (
            <span className="text-sm text-red-600">{toggleError}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleSaveToggles}
              disabled={savingToggles}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingToggles ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={handleCancelToggles}
              disabled={savingToggles}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entry list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          No entries for this type. Click "Add Entry" to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((bank) => (
            <div
              key={bank.id}
              className={`rounded-lg border p-4 ${
                pendingActive[bank.id] !== undefined
                  ? "border-amber-300 bg-amber-50"
                  : bank.is_active
                    ? "border-gray-200 bg-white"
                    : "border-gray-100 bg-gray-50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-gray-900">
                    {bank.content}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                      {bank.language?.toUpperCase() || "EN"}
                    </span>
                    <span className="text-xs text-gray-400">
                      Updated {formatDate(bank.updated_at)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Active toggle — pending until saved */}
                  <button
                    onClick={() => handleToggleActive(bank)}
                    disabled={savingToggles}
                    title={
                      pendingActive[bank.id] !== undefined
                        ? "Unsaved change — press Save to apply"
                        : bank.is_active
                          ? "Deactivate"
                          : "Activate"
                    }
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
                      pendingActive[bank.id] !== undefined
                        ? "bg-amber-100 text-amber-800 ring-1 ring-amber-400 hover:bg-amber-200"
                        : bank.is_active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {effectiveActive(bank) ? "Active" : "Inactive"}
                    {pendingActive[bank.id] !== undefined && " (unsaved)"}
                  </button>
                  {/* Edit */}
                  <button
                    onClick={() => openEditForm(bank)}
                    className="rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    Edit
                  </button>
                  {/* Delete */}
                  {deletingId === bank.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600">Delete?</span>
                      <button
                        onClick={() => handleDelete(bank.id)}
                        disabled={deleting}
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deleting ? "..." : "Yes"}
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(bank.id)}
                      className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingId ? "Edit Entry" : "New Entry"}
            </h2>

            {formError && (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Type selector (only for create) */}
            {!editingId && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as MessageBankType,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {BANK_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Language selector */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Language
              </label>
              <select
                value={form.language}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    language: e.target.value as SupportedLanguage,
                  }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_NAMES[lang]} ({lang.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Template variable reference in form */}
            {TEMPLATE_VARS[form.type] && (
              <div className="mb-3 rounded-md bg-blue-50 p-2 text-xs text-blue-700">
                <span className="font-medium">Available variables:</span>{" "}
                {TEMPLATE_VARS[form.type]!.join(", ")}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Content
              </label>
              <textarea
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                rows={5}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter message content..."
              />
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Active</span>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeForm}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
