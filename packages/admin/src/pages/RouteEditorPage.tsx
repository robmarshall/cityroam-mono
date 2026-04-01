import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  AdminRouteDetailResponse,
  AdminRouteGroupResponse,
  Route,
  RouteBlock,
  BlockType,
} from "@cityroam/shared/types";
import {
  routeSchema,
  blockConfigSchema,
  groupUpdateSchema,
  imageUploadSchema,
} from "@cityroam/shared/validation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type FieldErrors = Record<string, string>;

interface HintItemForm {
  content: string;
  image_url: string;
  delay_ms: string;
}

type BlockFormState =
  | { type: "message"; content: string; delay_ms: string }
  | { type: "image"; image_url: string; delay_ms: string }
  | {
      type: "question";
      clue: string;
      accepted_answers: string[];
      hints: HintItemForm[][];
      delay_ms: string;
    }
  | { type: "action"; label: string; delay_ms: string }
  | { type: "map"; google_maps_link: string; delay_ms: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CLS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const BTN_PRIMARY =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const BTN_SECONDARY =
  "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50";
const BTN_DANGER =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700";

const BLOCK_TYPE_META: Record<
  BlockType,
  { label: string; color: string; icon: string }
> = {
  message: { label: "Message", color: "bg-blue-100 text-blue-700", icon: "M" },
  image: { label: "Image", color: "bg-green-100 text-green-700", icon: "I" },
  question: {
    label: "Question",
    color: "bg-purple-100 text-purple-700",
    icon: "Q",
  },
  action: {
    label: "Action",
    color: "bg-orange-100 text-orange-700",
    icon: "A",
  },
  map: { label: "Map", color: "bg-red-100 text-red-700", icon: "P" },
};

const DELAY_PRESETS = [0, 500, 1000, 2000, 3000];

const TEMPLATE_VARS = [
  "{{CITY_NAME}}",
  "{{TOTAL_STOPS}}",
  "{{REVIEW_LINK}}",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zodFieldErrors(err: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): FieldErrors {
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

function emptyBlockForm(type: BlockType): BlockFormState {
  switch (type) {
    case "message":
      return { type: "message", content: "", delay_ms: "0" };
    case "image":
      return { type: "image", image_url: "", delay_ms: "0" };
    case "question":
      return {
        type: "question",
        clue: "",
        accepted_answers: [],
        hints: [
          [{ content: "", image_url: "", delay_ms: "0" }],
          [{ content: "", image_url: "", delay_ms: "0" }],
        ],
        delay_ms: "0",
      };
    case "action":
      return { type: "action", label: "", delay_ms: "0" };
    case "map":
      return { type: "map", google_maps_link: "", delay_ms: "0" };
  }
}

function blockToForm(block: RouteBlock): BlockFormState {
  const delay = String(block.delay_ms);
  const c = block.config;
  switch (c.type) {
    case "message":
      return { type: "message", content: c.content, delay_ms: delay };
    case "image":
      return { type: "image", image_url: c.image_url, delay_ms: delay };
    case "question":
      return {
        type: "question",
        clue: c.clue,
        accepted_answers: [...c.accepted_answers],
        hints: c.hints.map((seq) =>
          seq.map((item) => ({
            content: item.content,
            image_url: item.image_url ?? "",
            delay_ms: String(item.delay_ms),
          })),
        ),
        delay_ms: delay,
      };
    case "action":
      return { type: "action", label: c.label, delay_ms: delay };
    case "map":
      return {
        type: "map",
        google_maps_link: c.google_maps_link,
        delay_ms: delay,
      };
  }
}

function formToBlockPayload(form: BlockFormState): {
  type: BlockType;
  config: unknown;
  delay_ms: number;
} {
  const delay_ms = Number(form.delay_ms) || 0;
  switch (form.type) {
    case "message":
      return {
        type: "message",
        config: { type: "message", content: form.content },
        delay_ms,
      };
    case "image":
      return {
        type: "image",
        config: { type: "image", image_url: form.image_url },
        delay_ms,
      };
    case "question":
      return {
        type: "question",
        config: {
          type: "question",
          clue: form.clue,
          accepted_answers: form.accepted_answers,
          hints: form.hints.map((seq) =>
            seq.map((item) => ({
              content: item.content,
              image_url: item.image_url || null,
              delay_ms: Number(item.delay_ms) || 0,
            })),
          ),
        },
        delay_ms,
      };
    case "action":
      return {
        type: "action",
        config: { type: "action", label: form.label },
        delay_ms,
      };
    case "map":
      return {
        type: "map",
        config: { type: "map", google_maps_link: form.google_maps_link },
        delay_ms,
      };
  }
}

function blockSummary(block: RouteBlock): string {
  const c = block.config;
  switch (c.type) {
    case "message":
      return c.content.length > 60 ? c.content.slice(0, 60) + "..." : c.content;
    case "image":
      return c.image_url;
    case "question":
      return c.clue.length > 60 ? c.clue.slice(0, 60) + "..." : c.clue;
    case "action":
      return c.label;
    case "map":
      return c.google_maps_link;
  }
}

// ---------------------------------------------------------------------------
// DragHandle
// ---------------------------------------------------------------------------

function DragHandle(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="mr-3 cursor-grab touch-none text-gray-400 hover:text-gray-600"
      {...props}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="3" r="1.5" />
        <circle cx="11" cy="3" r="1.5" />
        <circle cx="5" cy="8" r="1.5" />
        <circle cx="11" cy="8" r="1.5" />
        <circle cx="5" cy="13" r="1.5" />
        <circle cx="11" cy="13" r="1.5" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SortableGroup
// ---------------------------------------------------------------------------

function SortableGroup({
  group,
  index,
  isCollapsed,
  onToggleCollapse,
  onEditName,
  onDelete,
  isDeleting,
  children,
}: {
  group: AdminRouteGroupResponse;
  index: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEditName: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-gray-200 bg-white"
    >
      {/* Group header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center">
          <DragHandle {...attributes} {...listeners} />
          <button
            type="button"
            onClick={onToggleCollapse}
            className="mr-2 text-gray-400 hover:text-gray-600"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`transform transition-transform ${isCollapsed ? "" : "rotate-90"}`}
            >
              <path d="M6 4l4 4-4 4V4z" />
            </svg>
          </button>
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-gray-900">
            {group.name}
          </span>
          <span className="ml-2 text-xs text-gray-500">
            ({group.blocks.length} block{group.blocks.length !== 1 ? "s" : ""})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEditName} className={BTN_SECONDARY}>
            Rename
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className={BTN_DANGER}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      {/* Group body */}
      {!isCollapsed && <div className="p-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableBlock
// ---------------------------------------------------------------------------

function SortableBlock({
  block,
  index,
  onEdit,
  onDelete,
  isDeleting,
}: {
  block: RouteBlock;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const meta = BLOCK_TYPE_META[block.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-3"
    >
      <div className="flex flex-1 items-center min-w-0">
        <DragHandle {...attributes} {...listeners} />
        <span className="mr-2 text-xs text-gray-400">{index + 1}.</span>
        <span
          className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${meta.color}`}
        >
          {meta.icon}
        </span>
        <span className="mr-2 text-xs font-medium text-gray-600">
          {meta.label}
        </span>
        <span className="truncate text-xs text-gray-500">
          {blockSummary(block)}
        </span>
        {block.delay_ms > 0 && (
          <span className="ml-2 whitespace-nowrap text-xs text-gray-400">
            +{block.delay_ms}ms
          </span>
        )}
      </div>
      <div className="ml-4 flex items-center gap-2">
        <button onClick={onEdit} className={BTN_SECONDARY}>
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className={BTN_DANGER}
        >
          {isDeleting ? "..." : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockTypePicker
// ---------------------------------------------------------------------------

function BlockTypePicker({ onPick }: { onPick: (type: BlockType) => void }) {
  const types: BlockType[] = ["message", "image", "question", "action", "map"];
  return (
    <div className="flex flex-wrap gap-2">
      {types.map((t) => {
        const meta = BLOCK_TYPE_META[t];
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${meta.color}`}
            >
              {meta.icon}
            </span>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DelayInput
// ---------------------------------------------------------------------------

function DelayInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Delay (ms)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min="0"
          max="30000"
          step="100"
          className={INPUT_CLS + " !w-24"}
        />
        <div className="flex gap-1">
          {DELAY_PRESETS.map((ms) => (
            <button
              key={ms}
              type="button"
              onClick={() => onChange(String(ms))}
              className={`rounded px-2 py-1 text-xs ${
                value === String(ms)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {ms === 0 ? "0" : `${ms / 1000}s`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HintSequenceEditor — edits a single hint (SequenceItem[])
// ---------------------------------------------------------------------------

function HintSequenceEditor({
  hintIndex,
  items,
  onChange,
  onRemoveHint,
  canRemove,
}: {
  hintIndex: number;
  items: HintItemForm[];
  onChange: (items: HintItemForm[]) => void;
  onRemoveHint: () => void;
  canRemove: boolean;
}) {
  function updateItem(idx: number, patch: Partial<HintItemForm>) {
    const updated = items.map((item, i) =>
      i === idx ? { ...item, ...patch } : item,
    );
    onChange(updated);
  }

  function addItem() {
    onChange([...items, { content: "", image_url: "", delay_ms: "0" }]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Hint {hintIndex + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemoveHint}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Remove hint
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 p-2"
          >
            <div className="flex-1 space-y-1">
              <textarea
                value={item.content}
                onChange={(e) => updateItem(idx, { content: e.target.value })}
                placeholder="Hint message content"
                rows={2}
                className={INPUT_CLS}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={item.image_url}
                  onChange={(e) =>
                    updateItem(idx, { image_url: e.target.value })
                  }
                  placeholder="Image URL (optional)"
                  className={INPUT_CLS}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={item.delay_ms}
                    onChange={(e) =>
                      updateItem(idx, { delay_ms: e.target.value })
                    }
                    min="0"
                    max="10000"
                    step="100"
                    className={INPUT_CLS + " !w-20"}
                    title="Delay (ms)"
                  />
                  <span className="text-xs text-gray-400">ms</span>
                </div>
              </div>
            </div>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="mt-1 text-xs text-red-500 hover:text-red-700"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
      >
        + Add sequence item
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockEditorForm
// ---------------------------------------------------------------------------

function BlockEditorForm({
  form,
  setForm,
  errors,
  answerInput,
  setAnswerInput,
  onUploadImage,
  uploadingImage,
}: {
  form: BlockFormState;
  setForm: (f: BlockFormState) => void;
  errors: FieldErrors;
  answerInput: string;
  setAnswerInput: (v: string) => void;
  onUploadImage: (file: File) => void;
  uploadingImage: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  switch (form.type) {
    case "message":
      return (
        <div className="space-y-4">
          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Available template variables:{" "}
            {TEMPLATE_VARS.map((v) => (
              <code key={v} className="mx-1 rounded bg-blue-100 px-1">
                {v}
              </code>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Content *
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={4}
              className={INPUT_CLS}
            />
            {errors["config.content"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.content"]}
              </p>
            )}
          </div>
          <DelayInput
            value={form.delay_ms}
            onChange={(v) => setForm({ ...form, delay_ms: v })}
          />
        </div>
      );

    case "image":
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Image URL *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.image_url}
                onChange={(e) =>
                  setForm({ ...form, image_url: e.target.value })
                }
                placeholder="https://..."
                className={INPUT_CLS}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className={BTN_SECONDARY + " whitespace-nowrap"}
              >
                {uploadingImage ? "Uploading..." : "Upload"}
              </button>
            </div>
            {errors["config.image_url"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.image_url"]}
              </p>
            )}
          </div>
          <DelayInput
            value={form.delay_ms}
            onChange={(v) => setForm({ ...form, delay_ms: v })}
          />
        </div>
      );

    case "question": {
      const qf = form; // narrowed to question type

      function addAnswer() {
        const trimmed = answerInput.trim();
        if (!trimmed || qf.accepted_answers.includes(trimmed)) {
          setAnswerInput("");
          return;
        }
        setForm({
          ...qf,
          accepted_answers: [...qf.accepted_answers, trimmed],
        });
        setAnswerInput("");
      }

      function removeAnswer(i: number) {
        setForm({
          ...qf,
          accepted_answers: qf.accepted_answers.filter((_: string, idx: number) => idx !== i),
        });
      }

      function updateHintSequence(hintIdx: number, items: HintItemForm[]) {
        const newHints = [...qf.hints];
        newHints[hintIdx] = items;
        setForm({ ...qf, hints: newHints });
      }

      function addHint() {
        if (qf.hints.length >= 3) return;
        setForm({
          ...qf,
          hints: [
            ...qf.hints,
            [{ content: "", image_url: "", delay_ms: "0" }],
          ],
        });
      }

      function removeHint(idx: number) {
        if (qf.hints.length <= 2) return;
        setForm({
          ...qf,
          hints: qf.hints.filter((_: HintItemForm[], i: number) => i !== idx),
        });
      }

      return (
        <div className="space-y-4">
          {/* Clue */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Clue *
            </label>
            <textarea
              value={form.clue}
              onChange={(e) => setForm({ ...form, clue: e.target.value })}
              rows={3}
              className={INPUT_CLS}
            />
            {errors["config.clue"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.clue"]}
              </p>
            )}
          </div>

          {/* Accepted Answers */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Accepted Answers *
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {form.accepted_answers.map((answer, i) => (
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
            {errors["config.accepted_answers"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.accepted_answers"]}
              </p>
            )}
          </div>

          {/* Hints */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Hints (2-3 required) *
            </label>
            <div className="space-y-3">
              {form.hints.map((seq, hi) => (
                <HintSequenceEditor
                  key={hi}
                  hintIndex={hi}
                  items={seq}
                  onChange={(items) => updateHintSequence(hi, items)}
                  onRemoveHint={() => removeHint(hi)}
                  canRemove={form.hints.length > 2}
                />
              ))}
            </div>
            {form.hints.length < 3 && (
              <button
                type="button"
                onClick={addHint}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                + Add hint
              </button>
            )}
            {errors["config.hints"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.hints"]}
              </p>
            )}
          </div>

          <DelayInput
            value={form.delay_ms}
            onChange={(v) => setForm({ ...form, delay_ms: v })}
          />
        </div>
      );
    }

    case "action":
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Label *
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Confirm arrival"
              className={INPUT_CLS}
            />
            {errors["config.label"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.label"]}
              </p>
            )}
          </div>
          <DelayInput
            value={form.delay_ms}
            onChange={(v) => setForm({ ...form, delay_ms: v })}
          />
        </div>
      );

    case "map":
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Google Maps Link *
            </label>
            <input
              type="text"
              value={form.google_maps_link}
              onChange={(e) =>
                setForm({ ...form, google_maps_link: e.target.value })
              }
              placeholder="https://maps.google.com/..."
              className={INPUT_CLS}
            />
            {errors["config.google_maps_link"] && (
              <p className="mt-1 text-sm text-red-600">
                {errors["config.google_maps_link"]}
              </p>
            )}
          </div>
          <DelayInput
            value={form.delay_ms}
            onChange={(v) => setForm({ ...form, delay_ms: v })}
          />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Component
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
  const [groups, setGroups] = useState<AdminRouteGroupResponse[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Group UI state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [editingGroupNameId, setEditingGroupNameId] = useState<string | null>(
    null,
  );
  const [groupNameForm, setGroupNameForm] = useState("");
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // Group reorder
  const savedGroupIds = useRef<string[]>([]);
  const [reorderedGroupIds, setReorderedGroupIds] = useState<string[] | null>(
    null,
  );
  const [savingGroupOrder, setSavingGroupOrder] = useState(false);

  // Block UI state
  const [editingBlock, setEditingBlock] = useState<{
    groupId: string;
    blockId: string | "new";
  } | null>(null);
  const [blockForm, setBlockForm] = useState<BlockFormState | null>(null);
  const [blockErrors, setBlockErrors] = useState<FieldErrors>({});
  const [savingBlock, setSavingBlock] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [pickingBlockType, setPickingBlockType] = useState<string | null>(null); // groupId or null
  const [uploadingImage, setUploadingImage] = useState(false);

  // Block reorder (per group)
  const savedBlockIdsMap = useRef<Record<string, string[]>>({});
  const [pendingBlockReorders, setPendingBlockReorders] = useState<
    Record<string, string[]>
  >({});
  const [savingBlockOrderGroupId, setSavingBlockOrderGroupId] = useState<
    string | null
  >(null);

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
      const sorted = [...res.groups].sort((a, b) => a.position - b.position);
      sorted.forEach((g) => {
        g.blocks = [...g.blocks].sort((a, b) => a.position - b.position);
      });
      setGroups(sorted);
      savedGroupIds.current = sorted.map((g) => g.id);
      const blockMap: Record<string, string[]> = {};
      for (const g of sorted) {
        blockMap[g.id] = g.blocks.map((b) => b.id);
      }
      savedBlockIdsMap.current = blockMap;
      setReorderedGroupIds(null);
      setPendingBlockReorders({});
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

  // ------- Group handlers -------
  async function handleAddGroup() {
    if (!id) return;
    const trimmed = newGroupName.trim();
    if (!trimmed) return;

    const result = groupUpdateSchema.safeParse({ name: trimmed });
    if (!result.success) return;

    setAddingGroup(false);
    try {
      await authFetch(() =>
        api.post(`/admin/routes/${id}/groups`, { name: result.data.name }),
      );
      setNewGroupName("");
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert(err.message);
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred.");
      }
    }
  }

  function openRenameGroup(group: AdminRouteGroupResponse) {
    setEditingGroupNameId(group.id);
    setGroupNameForm(group.name);
  }

  async function handleSaveGroupName() {
    if (!id || !editingGroupNameId) return;
    const trimmed = groupNameForm.trim();
    if (!trimmed) return;

    const result = groupUpdateSchema.safeParse({ name: trimmed });
    if (!result.success) return;

    setSavingGroupName(true);
    try {
      await authFetch(() =>
        api.put(`/admin/routes/${id}/groups/${editingGroupNameId}`, {
          name: result.data.name,
        }),
      );
      setEditingGroupNameId(null);
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert(err.message);
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred.");
      }
    } finally {
      setSavingGroupName(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!id) return;
    if (
      !window.confirm(
        "Are you sure you want to delete this group and all its blocks?",
      )
    )
      return;

    setDeletingGroupId(groupId);
    try {
      await authFetch(() =>
        api.delete(`/admin/routes/${id}/groups/${groupId}`),
      );
      // Close block editor if it was inside the deleted group
      if (editingBlock?.groupId === groupId) {
        setEditingBlock(null);
        setBlockForm(null);
      }
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert(err.message);
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred.");
      }
    } finally {
      setDeletingGroupId(null);
    }
  }

  // ------- Group drag & drop -------
  const groupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(groups, oldIndex, newIndex).map((g, i) => ({
      ...g,
      position: i,
    }));
    setGroups(reordered);

    const newIds = reordered.map((g) => g.id);
    const changed = savedGroupIds.current.some((id, i) => id !== newIds[i]);
    setReorderedGroupIds(changed ? newIds : null);
  }

  async function handleSaveGroupOrder() {
    if (!id || !reorderedGroupIds) return;
    setSavingGroupOrder(true);
    try {
      await authFetch(() =>
        api.put(`/admin/routes/${id}/groups/reorder`, {
          group_ids: reorderedGroupIds,
        }),
      );
      setReorderedGroupIds(null);
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert("Failed to save group order.");
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred while reordering.");
      }
      await fetchRoute();
      setReorderedGroupIds(null);
    } finally {
      setSavingGroupOrder(false);
    }
  }

  // ------- Block drag & drop (per-group) -------
  function makeBlockSensors() {
    return groupSensors; // reuse same sensor config
  }

  function handleBlockDragEnd(groupId: string) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const oldIndex = group.blocks.findIndex((b) => b.id === active.id);
      const newIndex = group.blocks.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(group.blocks, oldIndex, newIndex).map(
        (b, i) => ({ ...b, position: i }),
      );

      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, blocks: reordered } : g)),
      );

      const newIds = reordered.map((b) => b.id);
      const savedIds = savedBlockIdsMap.current[groupId] ?? [];
      const changed = savedIds.some((bid, i) => bid !== newIds[i]);

      setPendingBlockReorders((prev) => {
        if (changed) {
          return { ...prev, [groupId]: newIds };
        } else {
          const next = { ...prev };
          delete next[groupId];
          return next;
        }
      });
    };
  }

  async function handleSaveBlockOrder(groupId: string) {
    const blockIds = pendingBlockReorders[groupId];
    if (!blockIds) return;

    setSavingBlockOrderGroupId(groupId);
    try {
      await authFetch(() =>
        api.put(`/admin/groups/${groupId}/blocks/reorder`, {
          block_ids: blockIds,
        }),
      );
      setPendingBlockReorders((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert("Failed to save block order.");
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred while reordering.");
      }
      await fetchRoute();
    } finally {
      setSavingBlockOrderGroupId(null);
    }
  }

  // ------- Block handlers -------
  function openAddBlock(groupId: string) {
    setPickingBlockType(groupId);
    setEditingBlock(null);
    setBlockForm(null);
    setBlockErrors({});
    setAnswerInput("");
  }

  function handlePickBlockType(type: BlockType) {
    if (!pickingBlockType) return;
    setEditingBlock({ groupId: pickingBlockType, blockId: "new" });
    setBlockForm(emptyBlockForm(type));
    setBlockErrors({});
    setAnswerInput("");
    setPickingBlockType(null);
  }

  function openEditBlock(groupId: string, block: RouteBlock) {
    setEditingBlock({ groupId, blockId: block.id });
    setBlockForm(blockToForm(block));
    setBlockErrors({});
    setAnswerInput("");
    setPickingBlockType(null);
  }

  function cancelBlockForm() {
    setEditingBlock(null);
    setBlockForm(null);
    setBlockErrors({});
    setAnswerInput("");
    setPickingBlockType(null);
  }

  async function handleUploadBlockImage(file: File) {
    const validation = imageUploadSchema.safeParse({
      type: file.type,
      size: file.size,
      filename: file.name,
    });
    if (!validation.success) {
      setBlockErrors((prev) => ({
        ...prev,
        "config.image_url": validation.error.issues[0]?.message ?? "Invalid image",
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
        setBlockErrors((prev) => ({
          ...prev,
          "config.image_url": "Failed to upload image to storage",
        }));
        return;
      }

      if (blockForm?.type === "image") {
        setBlockForm({ ...blockForm, image_url: uploadRes.key });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setBlockErrors((prev) => ({
          ...prev,
          "config.image_url": "Failed to upload image",
        }));
      } else if (!(err instanceof ApiError)) {
        setBlockErrors((prev) => ({
          ...prev,
          "config.image_url": "Failed to upload image",
        }));
      }
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSaveBlock() {
    if (!editingBlock || !blockForm) return;

    const payload = formToBlockPayload(blockForm);

    // Validate config
    const configResult = blockConfigSchema.safeParse(payload.config);
    if (!configResult.success) {
      setBlockErrors(zodFieldErrors(configResult.error));
      return;
    }

    setSavingBlock(true);
    try {
      if (editingBlock.blockId === "new") {
        await authFetch(() =>
          api.post(`/admin/groups/${editingBlock.groupId}/blocks`, payload),
        );
      } else {
        await authFetch(() =>
          api.put(`/admin/blocks/${editingBlock.blockId}`, payload),
        );
      }
      cancelBlockForm();
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setBlockErrors({ _form: err.message });
      } else if (!(err instanceof ApiError)) {
        setBlockErrors({ _form: "An unexpected error occurred." });
      }
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!window.confirm("Are you sure you want to delete this block?")) return;

    setDeletingBlockId(blockId);
    try {
      await authFetch(() => api.delete(`/admin/blocks/${blockId}`));
      if (editingBlock?.blockId === blockId) cancelBlockForm();
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert(err.message);
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred.");
      }
    } finally {
      setDeletingBlockId(null);
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

      {/* Groups Section (edit mode only) */}
      {isEdit && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-900">
            Groups ({groups.length})
          </h2>

          {groups.length === 0 ? (
            <p className="mb-4 text-sm text-gray-500">
              No groups yet. Add your first group below.
            </p>
          ) : (
            <div className="mb-4 space-y-3">
              <DndContext
                sensors={groupSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleGroupDragEnd}
              >
                <SortableContext
                  items={groups.map((g) => g.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {groups.map((group, groupIndex) => (
                    <SortableGroup
                      key={group.id}
                      group={group}
                      index={groupIndex}
                      isCollapsed={collapsedGroups.has(group.id)}
                      onToggleCollapse={() =>
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })
                      }
                      onEditName={() => openRenameGroup(group)}
                      onDelete={() => handleDeleteGroup(group.id)}
                      isDeleting={deletingGroupId === group.id}
                    >
                      {/* Group name rename inline form */}
                      {editingGroupNameId === group.id && (
                        <div className="mb-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                          <input
                            type="text"
                            value={groupNameForm}
                            onChange={(e) => setGroupNameForm(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveGroupName();
                              }
                            }}
                            className={INPUT_CLS + " !w-64"}
                            autoFocus
                          />
                          <button
                            onClick={handleSaveGroupName}
                            disabled={savingGroupName}
                            className={BTN_PRIMARY}
                          >
                            {savingGroupName ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingGroupNameId(null)}
                            className={BTN_SECONDARY}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Blocks list with DnD */}
                      {group.blocks.length === 0 ? (
                        <p className="mb-3 text-sm text-gray-400">
                          No blocks in this group.
                        </p>
                      ) : (
                        <div className="mb-3 space-y-2">
                          <DndContext
                            sensors={makeBlockSensors()}
                            collisionDetection={closestCenter}
                            onDragEnd={handleBlockDragEnd(group.id)}
                          >
                            <SortableContext
                              items={group.blocks.map((b) => b.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {group.blocks.map((block, blockIndex) => (
                                <SortableBlock
                                  key={block.id}
                                  block={block}
                                  index={blockIndex}
                                  onEdit={() =>
                                    openEditBlock(group.id, block)
                                  }
                                  onDelete={() => handleDeleteBlock(block.id)}
                                  isDeleting={deletingBlockId === block.id}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>

                          {/* Save block order */}
                          {pendingBlockReorders[group.id] && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() =>
                                  handleSaveBlockOrder(group.id)
                                }
                                disabled={
                                  savingBlockOrderGroupId === group.id
                                }
                                className={BTN_PRIMARY}
                              >
                                {savingBlockOrderGroupId === group.id
                                  ? "Saving..."
                                  : "Save Block Order"}
                              </button>
                              <button
                                onClick={() => {
                                  setPendingBlockReorders((prev) => {
                                    const next = { ...prev };
                                    delete next[group.id];
                                    return next;
                                  });
                                  fetchRoute();
                                }}
                                disabled={
                                  savingBlockOrderGroupId === group.id
                                }
                                className={BTN_SECONDARY}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Block type picker */}
                      {pickingBlockType === group.id && (
                        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-4">
                          <p className="mb-2 text-sm font-medium text-gray-700">
                            Choose block type:
                          </p>
                          <BlockTypePicker onPick={handlePickBlockType} />
                          <button
                            onClick={() => setPickingBlockType(null)}
                            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Block editor form */}
                      {editingBlock?.groupId === group.id && blockForm && (
                        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                          <h4 className="mb-3 text-sm font-semibold text-gray-900">
                            {editingBlock.blockId === "new" ? "Add" : "Edit"}{" "}
                            {BLOCK_TYPE_META[blockForm.type].label} Block
                          </h4>

                          {blockErrors._form && (
                            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                              {blockErrors._form}
                            </div>
                          )}

                          <BlockEditorForm
                            form={blockForm}
                            setForm={setBlockForm}
                            errors={blockErrors}
                            answerInput={answerInput}
                            setAnswerInput={setAnswerInput}
                            onUploadImage={handleUploadBlockImage}
                            uploadingImage={uploadingImage}
                          />

                          <div className="mt-4 flex items-center gap-3">
                            <button
                              onClick={handleSaveBlock}
                              disabled={savingBlock}
                              className={BTN_PRIMARY}
                            >
                              {savingBlock ? "Saving..." : "Save Block"}
                            </button>
                            <button
                              onClick={cancelBlockForm}
                              className={BTN_SECONDARY}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Add block button */}
                      {pickingBlockType !== group.id &&
                        editingBlock?.groupId !== group.id && (
                          <button
                            onClick={() => openAddBlock(group.id)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            + Add Block
                          </button>
                        )}
                    </SortableGroup>
                  ))}
                </SortableContext>
              </DndContext>

              {/* Save group order */}
              {reorderedGroupIds && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleSaveGroupOrder}
                    disabled={savingGroupOrder}
                    className={BTN_PRIMARY}
                  >
                    {savingGroupOrder ? "Saving..." : "Save Group Order"}
                  </button>
                  <button
                    onClick={() => {
                      setReorderedGroupIds(null);
                      fetchRoute();
                    }}
                    disabled={savingGroupOrder}
                    className={BTN_SECONDARY}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add Group */}
          {addingGroup ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddGroup();
                  }
                }}
                placeholder="Group name"
                className={INPUT_CLS + " !w-64"}
                autoFocus
              />
              <button onClick={handleAddGroup} className={BTN_PRIMARY}>
                Add
              </button>
              <button
                onClick={() => {
                  setAddingGroup(false);
                  setNewGroupName("");
                }}
                className={BTN_SECONDARY}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingGroup(true)}
              className={BTN_PRIMARY}
            >
              Add Group
            </button>
          )}
        </div>
      )}
    </div>
  );
}
