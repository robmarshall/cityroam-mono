import { useCallback, useEffect, useState } from "react";
import type { AdminRouteFactsResponse, SupportedLanguage } from "@cityroam/shared/types";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@cityroam/shared/constants";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { formatDate } from "../lib/event-utils";
import {
  buildRouteFactsPayload,
  COVERED_OPTIONS,
  DOGS_OPTIONS,
  factsToForm,
  isRouteFactsFormDirty,
  mapUrlFromCoordinates,
  previewMapUrl,
  STEP_FREE_OPTIONS,
  TOILETS_OPTIONS,
  type RouteFactsFormErrors,
  type RouteFactsFormField,
  type RouteFactsFormState,
} from "../lib/route-facts-form";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/**
 * "Route facts" for a route family: what the marketing site's "Route at a
 * glance" box shows. Edits stay local until Save; Discard puts back the last
 * saved values. There is no <form>, so Enter in a field can't submit.
 */
export function RouteFactsPanel({
  familyId,
  onDirtyChange,
}: {
  familyId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const authFetch = useAuthFetch();
  const [saved, setSaved] = useState<RouteFactsFormState | null>(null);
  const [form, setForm] = useState<RouteFactsFormState | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<RouteFactsFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const apply = useCallback((res: AdminRouteFactsResponse) => {
    const next = factsToForm(res.facts);
    setSaved(next);
    setForm(next);
    setUpdatedAt(res.facts.updatedAt);
    setErrors({});
    setSaveError(null);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminRouteFactsResponse>(`/admin/route-families/${familyId}/facts`),
      );
      apply(res);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setLoadError("Failed to load route facts.");
    }
  }, [apply, authFetch, familyId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = form !== null && saved !== null && isRouteFactsFormDirty(form, saved);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  if (loadError) {
    return (
      <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Route facts</h2>
        <p className="mt-2 text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!form || !saved) {
    return (
      <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading route facts...
      </section>
    );
  }

  const set = <K extends keyof RouteFactsFormState>(key: K, value: RouteFactsFormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setJustSaved(false);
  };
  const setLabel = (lang: SupportedLanguage, value: string) => {
    setForm((f) => (f ? { ...f, label: { ...f.label, [lang]: value } } : f));
    setJustSaved(false);
  };

  const handleSave = async () => {
    const built = buildRouteFactsPayload(form);
    if (!built.ok) {
      setErrors(built.errors);
      setSaveError("Fix the highlighted fields, then save.");
      return;
    }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      const res = await authFetch(() =>
        api.put<AdminRouteFactsResponse>(`/admin/route-families/${familyId}/facts`, built.payload),
      );
      apply(res);
      setJustSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setSaveError(err.message || "Failed to save route facts.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!window.confirm("Discard your unsaved route facts changes?")) return;
    setForm(saved);
    setErrors({});
    setSaveError(null);
  };

  const mapLink = previewMapUrl(form);
  const suggestedUrl = mapUrlFromCoordinates(form);

  return (
    <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Route facts</h2>
        <span className="text-xs text-gray-500">
          {updatedAt ? `Last saved ${formatDate(updatedAt)}` : "Never saved"}
        </span>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Shown in the marketing site's "Route at a glance". Leave a fact blank (or "Not checked") and the site
        hides it. Only enter what has been checked on the ground. Distance and walking time here are the ones
        the site quotes. The start point must never be a stop.
      </p>

      <fieldset className="mb-6">
        <legend className="mb-3 text-sm font-semibold text-gray-800">Start point</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Field
              key={lang}
              label={`Label (${LANGUAGE_NAMES[lang]}${lang === "en" ? ", required" : ", optional"})`}
              error={errors[`label.${lang}` as RouteFactsFormField]}
            >
              <input
                type="text"
                value={form.label[lang]}
                onChange={(e) => setLabel(lang, e.target.value)}
                placeholder={lang === "en" ? "City Square" : form.label.en || "Uses the English label"}
                maxLength={80}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" error={errors.lat}>
            <input
              type="number"
              step="any"
              value={form.lat}
              onChange={(e) => set("lat", e.target.value)}
              placeholder="53.7963"
              className={inputClass}
            />
          </Field>
          <Field label="Longitude" error={errors.lng}>
            <input
              type="number"
              step="any"
              value={form.lng}
              onChange={(e) => set("lng", e.target.value)}
              placeholder="-1.5477"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Map URL (https://maps.google.com/?q=…)" error={errors.mapUrl}>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={form.mapUrl}
                onChange={(e) => set("mapUrl", e.target.value)}
                placeholder="https://maps.google.com/?q=53.7963,-1.5477"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => suggestedUrl && set("mapUrl", suggestedUrl)}
                disabled={!suggestedUrl || suggestedUrl === form.mapUrl.trim()}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Use latitude/longitude
              </button>
            </div>
          </Field>
          {mapLink ? (
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800"
            >
              Open in Google Maps &rarr;
            </a>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Enter coordinates or a map URL to check the pin.</p>
          )}
        </div>
        {errors.startPoint && <p className="mt-2 text-sm text-red-600">{errors.startPoint}</p>}
      </fieldset>

      <fieldset className="mb-6">
        <legend className="mb-3 text-sm font-semibold text-gray-800">The walk</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Distance (km)" error={errors.distanceKm}>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.distanceKm}
              onChange={(e) => set("distanceKm", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Walking time (mins)" error={errors.durationMins}>
            <input
              type="number"
              min="1"
              step="1"
              value={form.durationMins}
              onChange={(e) => set("durationMins", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Stops (answer stops)" error={errors.stops}>
            <input
              type="number"
              min="1"
              step="1"
              value={form.stops}
              onChange={(e) => set("stops", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="mb-3 text-sm font-semibold text-gray-800">Practicalities</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Step-free" error={errors.stepFree}>
            <Select value={form.stepFree} options={STEP_FREE_OPTIONS} onChange={(v) => set("stepFree", v)} />
          </Field>
          <Field label="Dogs" error={errors.dogs}>
            <Select value={form.dogs} options={DOGS_OPTIONS} onChange={(v) => set("dogs", v)} />
          </Field>
          <Field label="Toilets" error={errors.toilets}>
            <Select value={form.toilets} options={TOILETS_OPTIONS} onChange={(v) => set("toilets", v)} />
          </Field>
          <Field label="Under cover" error={errors.covered}>
            <Select value={form.covered} options={COVERED_OPTIONS} onChange={(v) => set("covered", v)} />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-4">
        {dirty && <span className="mr-auto text-sm text-amber-700">Unsaved changes</span>}
        {!dirty && justSaved && <span className="mr-auto text-sm text-green-700">Saved</span>}
        {saveError && <span className="mr-auto text-sm text-red-600">{saveError}</span>}
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!dirty || saving}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function Select<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as V)} className={inputClass}>
      {options.map((o) => (
        <option key={o.value || "unset"} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
