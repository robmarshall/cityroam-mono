import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  AdminRouteDetailResponse,
  Route,
  Stop,
} from "@cityroam/shared/types";
import {
  routeSchema,
  stopSchema,
  imageUploadSchema,
} from "@cityroam/shared/validation";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteForm {
  name: string;
  city: string;
  description: string;
  estimated_duration_mins: string;
  estimated_distance_km: string;
  is_active: boolean;
}

interface StopForm {
  name: string;
  directions_from_previous: string;
  clue: string;
  accepted_answers: string[];
  hints: string[];
  correct_response: string;
  fun_fact: string;
  images: string[];
  google_maps_link: string;
}

type FieldErrors = Record<string, string>;

function zodFieldErrors(err: { issues: Array<{ path: PropertyKey[]; message: string }> }): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const EMPTY_ROUTE_FORM: RouteForm = {
  name: "",
  city: "",
  description: "",
  estimated_duration_mins: "",
  estimated_distance_km: "",
  is_active: true,
};

function routeToForm(r: Route): RouteForm {
  return {
    name: r.name,
    city: r.city,
    description: r.description ?? "",
    estimated_duration_mins: String(r.estimated_duration_mins),
    estimated_distance_km: String(r.estimated_distance_km),
    is_active: r.is_active,
  };
}

const EMPTY_STOP_FORM: StopForm = {
  name: "",
  directions_from_previous: "",
  clue: "",
  accepted_answers: [],
  hints: ["", ""],
  correct_response: "",
  fun_fact: "",
  images: [],
  google_maps_link: "",
};

function stopToForm(s: Stop): StopForm {
  return {
    name: s.name,
    directions_from_previous: s.directions_from_previous ?? "",
    clue: s.clue,
    accepted_answers: [...s.accepted_answers],
    hints: [...s.hints],
    correct_response: s.correct_response ?? "",
    fun_fact: s.fun_fact ?? "",
    images: [...(s.images ?? [])],
    google_maps_link: s.google_maps_link ?? "",
  };
}

// ---------------------------------------------------------------------------
// Input classes
// ---------------------------------------------------------------------------

const INPUT_CLS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const BTN_PRIMARY =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const BTN_SECONDARY =
  "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50";
const BTN_DANGER =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RouteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const authFetch = useAuthFetch();

  // Route state
  const [routeForm, setRouteForm] = useState<RouteForm>(EMPTY_ROUTE_FORM);
  const [routeErrors, setRouteErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Loaded data (edit mode)
  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Stop editor state
  const [editingStopId, setEditingStopId] = useState<string | null>(null); // null = new stop form hidden, "new" = adding, stopId = editing
  const [stopForm, setStopForm] = useState<StopForm>(EMPTY_STOP_FORM);
  const [stopErrors, setStopErrors] = useState<FieldErrors>({});
  const [savingStop, setSavingStop] = useState(false);
  const [deletingStopId, setDeletingStopId] = useState<string | null>(null);

  // Tag input for accepted_answers
  const [answerInput, setAnswerInput] = useState("");

  // Drag state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ------- Fetch route -------
  const fetchRoute = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminRouteDetailResponse>(`/admin/routes/${id}`),
      );
      setRoute(res.route);
      setStops(res.stops);
      setRouteForm(routeToForm(res.route));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setFetchError("Route not found.");
      } else if (err instanceof ApiError && err.status !== 401) {
        setFetchError("Failed to load route data.");
      } else if (!(err instanceof ApiError)) {
        setFetchError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (isEdit) fetchRoute();
  }, [isEdit, fetchRoute]);

  // ------- Route form handlers -------
  function updateRouteField<K extends keyof RouteForm>(
    key: K,
    value: RouteForm[K],
  ) {
    setRouteForm((prev) => ({ ...prev, [key]: value }));
    setRouteErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSaveRoute() {
    const payload = {
      name: routeForm.name,
      city: routeForm.city,
      description: routeForm.description || undefined,
      estimated_duration_mins: Number(routeForm.estimated_duration_mins) || 0,
      estimated_distance_km: Number(routeForm.estimated_distance_km) || 0,
      is_active: routeForm.is_active,
    };

    const result = routeSchema.safeParse(payload);
    if (!result.success) {
      setRouteErrors(zodFieldErrors(result.error));
      return;
    }

    setSaving(true);
    try {
      if (isEdit && id) {
        await authFetch(() => api.put(`/admin/routes/${id}`, result.data));
        await fetchRoute();
      } else {
        const created = await authFetch(() =>
          api.post<{ route: Route }>("/admin/routes", result.data),
        );
        navigate(`/routes/${created.route.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setRouteErrors({ _form: err.message });
      } else if (!(err instanceof ApiError)) {
        setRouteErrors({ _form: "An unexpected error occurred." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoute() {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this route?")) return;

    setDeleting(true);
    try {
      await authFetch(() => api.delete(`/admin/routes/${id}`));
      navigate("/routes");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setRouteErrors({
            _form: "Cannot delete route with associated events",
          });
        } else if (err.status !== 401) {
          setRouteErrors({ _form: err.message });
        }
      } else {
        setRouteErrors({ _form: "An unexpected error occurred." });
      }
    } finally {
      setDeleting(false);
    }
  }

  // ------- Stop form handlers -------
  function openAddStop() {
    setEditingStopId("new");
    setStopForm(EMPTY_STOP_FORM);
    setStopErrors({});
    setAnswerInput("");
  }

  function openEditStop(stop: Stop) {
    setEditingStopId(stop.id);
    setStopForm(stopToForm(stop));
    setStopErrors({});
    setAnswerInput("");
  }

  function cancelStopForm() {
    setEditingStopId(null);
    setStopForm(EMPTY_STOP_FORM);
    setStopErrors({});
    setAnswerInput("");
  }

  function updateStopField<K extends keyof StopForm>(
    key: K,
    value: StopForm[K],
  ) {
    setStopForm((prev) => ({ ...prev, [key]: value }));
    setStopErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function addAnswer() {
    const trimmed = answerInput.trim();
    if (!trimmed) return;
    if (stopForm.accepted_answers.includes(trimmed)) {
      setAnswerInput("");
      return;
    }
    updateStopField("accepted_answers", [
      ...stopForm.accepted_answers,
      trimmed,
    ]);
    setAnswerInput("");
  }

  function removeAnswer(index: number) {
    updateStopField(
      "accepted_answers",
      stopForm.accepted_answers.filter((_, i) => i !== index),
    );
  }

  function updateHint(index: number, value: string) {
    const newHints = [...stopForm.hints];
    newHints[index] = value;
    updateStopField("hints", newHints);
  }

  function addHint() {
    if (stopForm.hints.length >= 3) return;
    updateStopField("hints", [...stopForm.hints, ""]);
  }

  function removeHint(index: number) {
    if (stopForm.hints.length <= 2) return;
    updateStopField(
      "hints",
      stopForm.hints.filter((_, i) => i !== index),
    );
  }

  async function handleUploadImage(file: File) {
    const validation = imageUploadSchema.safeParse({
      type: file.type,
      size: file.size,
      filename: file.name,
    });
    if (!validation.success) {
      setStopErrors((prev) => ({
        ...prev,
        images: validation.error.issues[0]?.message ?? "Invalid image",
      }));
      return;
    }

    setUploadingImage(true);
    try {
      const uploadRes = await authFetch(() =>
        api.post<{ upload_url: string; key: string }>("/admin/upload", {
          filename: file.name,
          content_type: file.type,
        }),
      );

      const uploadResponse = await fetch(uploadRes.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) {
        setStopErrors((prev) => ({ ...prev, images: "Failed to upload image to storage" }));
        return;
      }

      updateStopField("images", [...stopForm.images, uploadRes.key]);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setStopErrors((prev) => ({ ...prev, images: "Failed to upload image" }));
      } else if (!(err instanceof ApiError)) {
        setStopErrors((prev) => ({ ...prev, images: "Failed to upload image" }));
      }
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(index: number) {
    updateStopField(
      "images",
      stopForm.images.filter((_, i) => i !== index),
    );
  }

  async function handleSaveStop() {
    const payload = {
      name: stopForm.name,
      directions_from_previous: stopForm.directions_from_previous || undefined,
      clue: stopForm.clue,
      accepted_answers: stopForm.accepted_answers,
      hints: stopForm.hints.filter((h) => h.trim() !== ""),
      correct_response: stopForm.correct_response || undefined,
      fun_fact: stopForm.fun_fact || undefined,
      images: stopForm.images,
      google_maps_link: stopForm.google_maps_link || undefined,
    };

    const result = stopSchema.safeParse(payload);
    if (!result.success) {
      setStopErrors(zodFieldErrors(result.error));
      return;
    }

    setSavingStop(true);
    try {
      if (editingStopId === "new") {
        await authFetch(() =>
          api.post(`/admin/routes/${id}/stops`, result.data),
        );
      } else {
        await authFetch(() =>
          api.put(`/admin/routes/${id}/stops/${editingStopId}`, result.data),
        );
      }
      cancelStopForm();
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setStopErrors({ _form: err.message });
      } else if (!(err instanceof ApiError)) {
        setStopErrors({ _form: "An unexpected error occurred." });
      }
    } finally {
      setSavingStop(false);
    }
  }

  async function handleDeleteStop(stopId: string) {
    if (!window.confirm("Are you sure you want to delete this stop?")) return;

    setDeletingStopId(stopId);
    try {
      await authFetch(() =>
        api.delete(`/admin/routes/${id}/stops/${stopId}`),
      );
      if (editingStopId === stopId) cancelStopForm();
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert(err.message);
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred.");
      }
    } finally {
      setDeletingStopId(null);
    }
  }

  // ------- Drag & Drop -------
  // Drag indices refer to sortedStops (rendered order), so we operate on
  // sortedStops and write back the full reordered array.
  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragEnter(index: number) {
    dragOverItem.current = index;
  }

  async function handleDrop() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    const sorted = [...stops].sort((a, b) => a.stop_number - b.stop_number);
    const [removed] = sorted.splice(dragItem.current, 1);
    sorted.splice(dragOverItem.current, 0, removed);
    const reordered = sorted;

    dragItem.current = null;
    dragOverItem.current = null;

    setStops(reordered);

    try {
      await authFetch(() =>
        api.put(`/admin/routes/${id}/stops/reorder`, {
          stop_ids: reordered.map((s) => s.id),
        }),
      );
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        await fetchRoute();
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred while reordering.");
        await fetchRoute();
      }
    }
  }

  // ------- Render -------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{fetchError}</p>
        <button onClick={fetchRoute} className={BTN_PRIMARY}>
          Retry
        </button>
      </div>
    );
  }

  const sortedStops = [...stops].sort(
    (a, b) => a.stop_number - b.stop_number,
  );

  return (
    <div>
      {/* Back link */}
      <Link
        to="/routes"
        className="mb-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
      >
        &larr; Back to Routes
      </Link>

      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        {isEdit ? "Edit Route" : "Create Route"}
      </h1>

      {/* Route Form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-900">
          Route Details
        </h2>

        {routeErrors._form && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {routeErrors._form}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              type="text"
              value={routeForm.name}
              onChange={(e) => updateRouteField("name", e.target.value)}
              className={INPUT_CLS}
            />
            {routeErrors.name && (
              <p className="mt-1 text-sm text-red-600">{routeErrors.name}</p>
            )}
          </div>

          {/* City */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              City *
            </label>
            <input
              type="text"
              value={routeForm.city}
              onChange={(e) => updateRouteField("city", e.target.value)}
              className={INPUT_CLS}
            />
            {routeErrors.city && (
              <p className="mt-1 text-sm text-red-600">{routeErrors.city}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={routeForm.description}
              onChange={(e) => updateRouteField("description", e.target.value)}
              rows={3}
              className={INPUT_CLS}
            />
            {routeErrors.description && (
              <p className="mt-1 text-sm text-red-600">
                {routeErrors.description}
              </p>
            )}
          </div>

          {/* Duration & Distance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Estimated Duration (mins) *
              </label>
              <input
                type="number"
                value={routeForm.estimated_duration_mins}
                onChange={(e) =>
                  updateRouteField("estimated_duration_mins", e.target.value)
                }
                className={INPUT_CLS}
                min="1"
              />
              {routeErrors.estimated_duration_mins && (
                <p className="mt-1 text-sm text-red-600">
                  {routeErrors.estimated_duration_mins}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Estimated Distance (km) *
              </label>
              <input
                type="number"
                value={routeForm.estimated_distance_km}
                onChange={(e) =>
                  updateRouteField("estimated_distance_km", e.target.value)
                }
                className={INPUT_CLS}
                min="0.1"
                step="0.1"
              />
              {routeErrors.estimated_distance_km && (
                <p className="mt-1 text-sm text-red-600">
                  {routeErrors.estimated_distance_km}
                </p>
              )}
            </div>
          </div>

          {/* Is Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={routeForm.is_active}
              onChange={(e) => updateRouteField("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="is_active"
              className="text-sm font-medium text-gray-700"
            >
              Active
            </label>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveRoute}
              disabled={saving}
              className={BTN_PRIMARY}
            >
              {saving ? "Saving..." : "Save Route"}
            </button>
            {isEdit && (
              <button
                onClick={handleDeleteRoute}
                disabled={deleting}
                className={BTN_DANGER}
              >
                {deleting ? "Deleting..." : "Delete Route"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stops Section (edit mode only) */}
      {isEdit && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-900">
            Stops ({sortedStops.length})
          </h2>

          {sortedStops.length === 0 ? (
            <p className="mb-4 text-sm text-gray-500">
              No stops yet. Add your first stop below.
            </p>
          ) : (
            <div className="mb-4 space-y-2">
              {sortedStops.map((stop, index) => (
                <div
                  key={stop.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-3 cursor-grab"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                        {stop.stop_number}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {stop.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        Clue:{" "}
                        {stop.clue.length > 60
                          ? stop.clue.slice(0, 60) + "..."
                          : stop.clue}
                      </span>
                      <span>
                        {stop.accepted_answers.length} answer
                        {stop.accepted_answers.length !== 1 ? "s" : ""}
                      </span>
                      <span>
                        {stop.hints.length} hint
                        {stop.hints.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <button
                      onClick={() => openEditStop(stop)}
                      className={BTN_SECONDARY}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteStop(stop.id)}
                      disabled={deletingStopId === stop.id}
                      className={BTN_DANGER}
                    >
                      {deletingStopId === stop.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Stop button */}
          {editingStopId === null && (
            <button onClick={openAddStop} className={BTN_PRIMARY}>
              Add Stop
            </button>
          )}

          {/* Stop Form */}
          {editingStopId !== null && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">
                {editingStopId === "new" ? "Add Stop" : "Edit Stop"}
              </h3>

              {stopErrors._form && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {stopErrors._form}
                </div>
              )}

              <div className="space-y-4">
                {/* Stop Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={stopForm.name}
                    onChange={(e) => updateStopField("name", e.target.value)}
                    className={INPUT_CLS}
                  />
                  {stopErrors.name && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.name}
                    </p>
                  )}
                </div>

                {/* Directions from Previous */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Directions from Previous
                  </label>
                  <textarea
                    value={stopForm.directions_from_previous}
                    onChange={(e) =>
                      updateStopField(
                        "directions_from_previous",
                        e.target.value,
                      )
                    }
                    rows={2}
                    className={INPUT_CLS}
                  />
                  {stopErrors.directions_from_previous && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.directions_from_previous}
                    </p>
                  )}
                </div>

                {/* Clue */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Clue *
                  </label>
                  <textarea
                    value={stopForm.clue}
                    onChange={(e) => updateStopField("clue", e.target.value)}
                    rows={3}
                    className={INPUT_CLS}
                  />
                  {stopErrors.clue && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.clue}
                    </p>
                  )}
                </div>

                {/* Accepted Answers */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Accepted Answers *
                  </label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {stopForm.accepted_answers.map((answer, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                      >
                        {answer}
                        <button
                          type="button"
                          onClick={() => removeAnswer(i)}
                          className="ml-1 text-blue-500 hover:text-blue-800"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addAnswer();
                      }
                    }}
                    placeholder="Type an answer and press Enter"
                    className={INPUT_CLS}
                  />
                  {stopErrors.accepted_answers && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.accepted_answers}
                    </p>
                  )}
                </div>

                {/* Hints */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Hints (2-3 required) *
                  </label>
                  <div className="space-y-2">
                    {stopForm.hints.map((hint, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={hint}
                          onChange={(e) => updateHint(i, e.target.value)}
                          placeholder={`Hint ${i + 1}`}
                          className={INPUT_CLS}
                        />
                        {stopForm.hints.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeHint(i)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {stopForm.hints.length < 3 && (
                    <button
                      type="button"
                      onClick={addHint}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                      + Add hint
                    </button>
                  )}
                  {stopErrors.hints && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.hints}
                    </p>
                  )}
                </div>

                {/* Correct Response */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Correct Response
                  </label>
                  <textarea
                    value={stopForm.correct_response}
                    onChange={(e) =>
                      updateStopField("correct_response", e.target.value)
                    }
                    rows={2}
                    className={INPUT_CLS}
                  />
                  {stopErrors.correct_response && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.correct_response}
                    </p>
                  )}
                </div>

                {/* Fun Fact */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Fun Fact
                  </label>
                  <textarea
                    value={stopForm.fun_fact}
                    onChange={(e) =>
                      updateStopField("fun_fact", e.target.value)
                    }
                    rows={2}
                    className={INPUT_CLS}
                  />
                  {stopErrors.fun_fact && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.fun_fact}
                    </p>
                  )}
                </div>

                {/* Images */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Images
                  </label>
                  {stopForm.images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {stopForm.images.map((key, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs"
                        >
                          <span className="max-w-[200px] truncate text-gray-700">
                            {key}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="text-red-500 hover:text-red-700"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className={BTN_SECONDARY}
                  >
                    {uploadingImage ? "Uploading..." : "Upload Image"}
                  </button>
                  {stopErrors.images && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.images}
                    </p>
                  )}
                </div>

                {/* Google Maps Link */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Google Maps Link
                  </label>
                  <input
                    type="text"
                    value={stopForm.google_maps_link}
                    onChange={(e) =>
                      updateStopField("google_maps_link", e.target.value)
                    }
                    placeholder="https://maps.google.com/..."
                    className={INPUT_CLS}
                  />
                  {stopErrors.google_maps_link && (
                    <p className="mt-1 text-sm text-red-600">
                      {stopErrors.google_maps_link}
                    </p>
                  )}
                </div>

                {/* Stop Form Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSaveStop}
                    disabled={savingStop}
                    className={BTN_PRIMARY}
                  >
                    {savingStop ? "Saving..." : "Save Stop"}
                  </button>
                  <button onClick={cancelStopForm} className={BTN_SECONDARY}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
