import { useCallback, useEffect, useState } from "react";
import type {
  AdminOpeningSequenceListResponse,
  AdminOpeningSequence,
  AdminOpeningSequenceDetailResponse,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";

const OPENING_TEMPLATE_VARS = [
  "{{FIRST_STOP_DIRECTIONS}}",
  "{{FIRST_CLUE}}",
  "{{CITY_NAME}}",
  "{{TOTAL_STOPS}}",
];

interface ItemForm {
  content: string;
  image_url: string;
  delay_ms: number;
}

interface SequenceForm {
  name: string;
  is_active: boolean;
  items: ItemForm[];
}

function emptyItem(): ItemForm {
  return { content: "", image_url: "", delay_ms: 0 };
}

function emptyForm(): SequenceForm {
  return { name: "", is_active: true, items: [emptyItem()] };
}

export default function OpeningSequencesPage() {
  const [sequences, setSequences] = useState<AdminOpeningSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthFetch();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SequenceForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminOpeningSequenceListResponse>("/admin/opening-sequences"),
      );
      setSequences(res.sequences);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError("Failed to load opening sequences.");
      } else if (!(err instanceof ApiError)) {
        setError("Failed to load opening sequences.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (seq: AdminOpeningSequence) => {
    setEditingId(seq.id);
    setForm({
      name: seq.name,
      is_active: seq.is_active,
      items: seq.items.map((i) => ({
        content: i.content,
        image_url: i.image_url ?? "",
        delay_ms: i.delay_ms,
      })),
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (form.items.length === 0) {
      setFormError("At least one message item is required.");
      return;
    }
    // Validate each item has content or image
    for (let i = 0; i < form.items.length; i++) {
      const item = form.items[i];
      if (!item.content.trim() && !item.image_url.trim()) {
        setFormError(`Item ${i + 1} must have content or an image URL.`);
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      is_active: form.is_active,
      items: form.items.map((item) => ({
        content: item.content,
        image_url: item.image_url.trim() || null,
        delay_ms: item.delay_ms,
      })),
    };

    try {
      if (editingId) {
        await authFetch(() =>
          api.put<AdminOpeningSequenceDetailResponse>(
            `/admin/opening-sequences/${editingId}`,
            payload,
          ),
        );
      } else {
        await authFetch(() =>
          api.post<AdminOpeningSequenceDetailResponse>(
            "/admin/opening-sequences",
            payload,
          ),
        );
      }
      closeForm();
      await fetchSequences();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save sequence.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await authFetch(() =>
        api.delete(`/admin/opening-sequences/${deletingId}`),
      );
      setDeletingId(null);
      await fetchSequences();
    } catch {
      // Handled by authFetch
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (seq: AdminOpeningSequence) => {
    try {
      await authFetch(() =>
        api.put(`/admin/opening-sequences/${seq.id}`, {
          name: seq.name,
          is_active: !seq.is_active,
          items: seq.items.map((i) => ({
            content: i.content,
            image_url: i.image_url,
            delay_ms: i.delay_ms,
          })),
        }),
      );
      await fetchSequences();
    } catch {
      // Handled by authFetch
    }
  };

  // Item management helpers
  const updateItem = (index: number, field: keyof ItemForm, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, emptyItem()],
    }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      const target = index + direction;
      if (target < 0 || target >= newItems.length) return prev;
      [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
      return { ...prev, items: newItems };
    });
  };

  const activeCount = sequences.filter((s) => s.is_active).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opening Sequences</h1>
          <p className="mt-1 text-sm text-gray-500">
            Multi-message sequences sent when a game starts. One is selected at random.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Sequence
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={fetchSequences} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}

      {activeCount === 0 && !loading && (
        <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
          No active sequences. Games cannot start without at least one active opening sequence.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : sequences.length === 0 ? (
        <p className="text-sm text-gray-500">No opening sequences yet.</p>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className={`rounded-lg border p-4 ${
                seq.is_active
                  ? "border-gray-200 bg-white"
                  : "border-gray-200 bg-gray-50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{seq.name}</h3>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        seq.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {seq.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {seq.items.length} message{seq.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {seq.items.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="shrink-0 text-xs text-gray-400">
                          {i + 1}.
                        </span>
                        {item.content && (
                          <span className="truncate">
                            {item.content.length > 80
                              ? item.content.slice(0, 80) + "..."
                              : item.content}
                          </span>
                        )}
                        {item.image_url && (
                          <span className="shrink-0 text-xs text-blue-500">[image]</span>
                        )}
                        {item.delay_ms > 0 && (
                          <span className="shrink-0 text-xs text-gray-400">
                            ({item.delay_ms}ms delay)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleToggleActive(seq)}
                    className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    {seq.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => openEditForm(seq)}
                    className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingId(seq.id)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? "Edit Sequence" : "New Opening Sequence"}
            </h2>

            {/* Template variable reference */}
            <div className="mt-3 rounded-md bg-blue-50 p-3 text-xs text-blue-700">
              <strong>Template variables:</strong>{" "}
              {OPENING_TEMPLATE_VARS.join(", ")}
            </div>

            {formError && (
              <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Name */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Friendly opener v1"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Active toggle */}
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, is_active: e.target.checked }))
                }
                className="rounded border-gray-300"
              />
              Active
            </label>

            {/* Items */}
            <div className="mt-5">
              <h3 className="text-sm font-medium text-gray-700">Messages</h3>
              <div className="mt-2 space-y-4">
                {form.items.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">
                        Message {index + 1}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                          className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                          title="Move up"
                        >
                          &uarr;
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(index, 1)}
                          disabled={index === form.items.length - 1}
                          className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                          title="Move down"
                        >
                          &darr;
                        </button>
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <textarea
                      value={item.content}
                      onChange={(e) =>
                        updateItem(index, "content", e.target.value)
                      }
                      placeholder="Message text (leave empty for image-only)"
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />

                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {/* Image URL */}
                      <div>
                        <label className="block text-xs text-gray-500">
                          Image URL (optional)
                        </label>
                        <input
                          type="text"
                          value={item.image_url}
                          onChange={(e) =>
                            updateItem(index, "image_url", e.target.value)
                          }
                          placeholder="https://..."
                          className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {/* Delay */}
                      <div>
                        <label className="block text-xs text-gray-500">
                          Delay before (ms)
                        </label>
                        <div className="mt-0.5 flex items-center gap-2">
                          <input
                            type="number"
                            value={item.delay_ms}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "delay_ms",
                                Math.max(0, parseInt(e.target.value) || 0),
                              )
                            }
                            min={0}
                            max={10000}
                            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex gap-1">
                            {[500, 1000, 1500, 2000].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() =>
                                  updateItem(index, "delay_ms", preset)
                                }
                                className={`rounded px-1.5 py-0.5 text-xs ${
                                  item.delay_ms === preset
                                    ? "bg-blue-100 text-blue-700"
                                    : "text-gray-500 hover:bg-gray-200"
                                }`}
                              >
                                {preset / 1000}s
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addItem}
                className="mt-3 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700"
              >
                + Add Message
              </button>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeForm}
                disabled={saving}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Delete Sequence?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete this opening sequence and all its
              messages.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                disabled={deleting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
