import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import type {
  AdminRouteDetailResponse,
  AdminRouteGroupResponse,
  Route,
  RouteFamily,
  RouteBlock,
  BlockType,
  SupportedLanguage,
} from "@cityroam/shared/types";
import { LANGUAGE_NAMES } from "@cityroam/shared/constants";
import {
  routeSchema,
  blockConfigSchema,
  groupUpdateSchema,
  imageUploadSchema,
} from "@cityroam/shared/validation";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
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
  description: string;
  city: string;
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

interface BlockEditorState {
  groupId: string;
  form: BlockFormState;
  errors: FieldErrors;
  saving: boolean;
  answerInput: string;
  uploadingImage: boolean;
}

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
  description: "",
  city: "",
  estimated_duration_mins: "",
  estimated_distance_km: "",
  is_active: true,
};

function routeToForm(r: Route): RouteForm {
  return {
    name: r.name,
    description: r.description ?? "",
    // City lives on the route family, not the route — only used when creating
    // a route without a family (see the Create Route path).
    city: "",
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
      className={`mr-3 touch-none ${
        props.disabled
          ? "cursor-not-allowed text-gray-200"
          : "cursor-grab text-gray-400 hover:text-gray-600"
      }`}
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
// DroppableGroupZone — allows dropping blocks into empty groups
// ---------------------------------------------------------------------------

function DroppableGroupZone({ groupId }: { groupId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `droppable-${groupId}` });
  return (
    <div
      ref={setNodeRef}
      className={`mb-3 rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
        isOver
          ? "border-blue-400 bg-blue-50 text-blue-600"
          : "border-gray-200 text-gray-400"
      }`}
    >
      {isOver ? "Drop block here" : "No blocks in this group."}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableBlock — accordion-style block with inline editing
// ---------------------------------------------------------------------------

function SortableBlock({
  block,
  index,
  isExpanded,
  onToggleExpand,
  onDelete,
  isDeleting,
  editorState,
  onUpdateForm,
  onUpdateErrors,
  onSave,
  onCancel,
  onUploadImage,
  onSetAnswerInput,
}: {
  block: RouteBlock;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  editorState: BlockEditorState | undefined;
  onUpdateForm: (form: BlockFormState) => void;
  onUpdateErrors: (errors: FieldErrors) => void;
  onSave: () => void;
  onCancel: () => void;
  onUploadImage: (file: File) => void;
  onSetAnswerInput: (v: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    // Dragging a block while its editor is open would throw away the unsaved
    // edits, so the handle stays disabled until the editor is closed or saved.
    disabled: isExpanded,
  });

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
      className={`rounded-md border bg-gray-50 ${
        isExpanded ? "border-blue-300" : "border-gray-200"
      }`}
    >
      {/* Collapsed header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-1 items-center min-w-0">
          <DragHandle
            {...attributes}
            {...listeners}
            disabled={isExpanded}
            title={
              isExpanded
                ? "Close or save this block editor before moving the block"
                : "Drag to reorder or move to another group"
            }
          />
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
          <button
            onClick={onToggleExpand}
            className={isExpanded ? BTN_PRIMARY : BTN_SECONDARY}
          >
            {isExpanded ? "Close" : "Edit"}
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

      {/* Expanded accordion content */}
      {isExpanded && editorState && (
        <div className="border-t border-blue-200 bg-blue-50 px-4 py-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">
            Edit {BLOCK_TYPE_META[editorState.form.type].label} Block
          </h4>

          {editorState.errors._form && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {editorState.errors._form}
            </div>
          )}

          <BlockEditorForm
            form={editorState.form}
            setForm={onUpdateForm}
            errors={editorState.errors}
            answerInput={editorState.answerInput}
            setAnswerInput={onSetAnswerInput}
            onUploadImage={onUploadImage}
            uploadingImage={editorState.uploadingImage}
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={editorState.saving}
              className={BTN_PRIMARY}
            >
              {editorState.saving ? "Saving..." : "Save Block"}
            </button>
            <button onClick={onCancel} className={BTN_SECONDARY}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockOverlay — drag overlay for blocks being dragged
// ---------------------------------------------------------------------------

function BlockOverlay({ block }: { block: RouteBlock }) {
  const meta = BLOCK_TYPE_META[block.type];
  return (
    <div className="flex items-center rounded-md border border-blue-300 bg-white px-4 py-3 shadow-lg">
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
          max="300000"
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
  const [routeFamily, setRouteFamily] = useState<RouteFamily | null>(null);
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

  // Block editors (multi-block accordion)
  const [openEditors, setOpenEditors] = useState<Map<string, BlockEditorState>>(
    () => new Map(),
  );
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [pickingBlockType, setPickingBlockType] = useState<string | null>(null); // groupId or null

  // Block layout (reorders within a group + moves between groups).
  // savedBlockIdsMap holds the last layout the server confirmed; the pending
  // layout is whatever `groups` currently holds. Nothing is persisted until
  // "Save Block Layout" is pressed.
  const savedBlockIdsMap = useRef<Record<string, string[]>>({});
  const [savingBlockLayout, setSavingBlockLayout] = useState(false);

  // Block DnD cross-group state
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeItemType, setActiveItemType] = useState<
    "group" | "block" | null
  >(null);

  // Diff the on-screen layout against the last saved layout.
  const blockLayout = useMemo(() => {
    const saved = savedBlockIdsMap.current;
    const savedGroupOfBlock = new Map<string, string>();
    for (const [gid, ids] of Object.entries(saved)) {
      for (const bid of ids) savedGroupOfBlock.set(bid, gid);
    }

    const moves: {
      blockId: string;
      fromGroupId: string;
      toGroupId: string;
      position: number;
    }[] = [];
    const changedGroupIds: string[] = [];
    const orderByGroupId: Record<string, string[]> = {};

    for (const g of groups) {
      const currentIds = g.blocks.map((b) => b.id);
      orderByGroupId[g.id] = currentIds;

      currentIds.forEach((bid, i) => {
        const from = savedGroupOfBlock.get(bid);
        if (from && from !== g.id) {
          moves.push({
            blockId: bid,
            fromGroupId: from,
            toGroupId: g.id,
            position: i,
          });
        }
      });

      const savedIds = saved[g.id] ?? [];
      const unchanged =
        savedIds.length === currentIds.length &&
        savedIds.every((bid, i) => bid === currentIds[i]);
      if (!unchanged) changedGroupIds.push(g.id);
    }

    return {
      moves,
      changedGroupIds,
      orderByGroupId,
      hasChanges: changedGroupIds.length > 0,
    };
  }, [groups]);

  const changedGroupIdSet = useMemo(
    () => new Set(blockLayout.changedGroupIds),
    [blockLayout],
  );

  // ------- Dirty state tracking -------
  const savedRouteForm = useRef<RouteForm>(EMPTY_ROUTE_FORM);
  useEffect(() => {
    if (route) savedRouteForm.current = routeToForm(route);
  }, [route]);

  const isDirty = useMemo(() => {
    // Route form changed?
    const formKeys = Object.keys(savedRouteForm.current) as (keyof RouteForm)[];
    const routeChanged = formKeys.some(
      (k) => routeForm[k] !== savedRouteForm.current[k],
    );
    // Open block editors with unsaved changes?
    const hasOpenEditors = openEditors.size > 0;
    // Pending reorders?
    const hasPendingGroupReorder = reorderedGroupIds !== null;
    return (
      routeChanged ||
      hasOpenEditors ||
      hasPendingGroupReorder ||
      blockLayout.hasChanges
    );
  }, [routeForm, openEditors, reorderedGroupIds, blockLayout]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // In-app navigation guard (data router — react-router v6 useBlocker).
  // Navigation we trigger ourselves after a successful save or delete sets
  // skipBlockerRef so the user is not asked about changes that just landed.
  const skipBlockerRef = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skipBlockerRef.current) {
      skipBlockerRef.current = false;
      return false;
    }
    return isDirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm(
      "You have unsaved changes. Leave this page and discard them?",
    );
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  // ------- Editor helpers -------
  function updateEditor(key: string, patch: Partial<BlockEditorState>) {
    setOpenEditors((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) next.set(key, { ...existing, ...patch });
      return next;
    });
  }

  function removeEditor(key: string) {
    setOpenEditors((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

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
      setRouteFamily(res.route_family);
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

  // Prune stale editors when groups change
  useEffect(() => {
    const allBlockIds = new Set(
      groups.flatMap((g) => g.blocks.map((b) => b.id)),
    );
    setOpenEditors((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!key.startsWith("new-") && !allBlockIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);

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
    if (isEdit && !confirmLosingBlockLayout("Saving the route")) return;
    // The API needs either a route_family_id or a city. In edit mode the city
    // comes from the loaded family; when creating a standalone route there is
    // no family yet, so the user supplies the city on the form.
    const payload = {
      name: routeForm.name,
      city: routeFamily?.city ?? routeForm.city.trim(),
      description: routeForm.description || undefined,
      estimated_duration_mins: Number(routeForm.estimated_duration_mins) || 0,
      estimated_distance_km: Number(routeForm.estimated_distance_km) || 0,
      is_active: routeForm.is_active,
    };

    const result = routeSchema.safeParse(payload);
    if (!result.success) {
      const errors = zodFieldErrors(result.error);
      // The "family or city" rule reports under route_family_id, which has no
      // input on this page — show it on the City field instead.
      if (errors.route_family_id && !isEdit) {
        errors.city = "City is required to create a route family.";
        delete errors.route_family_id;
      }
      setRouteErrors(errors);
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
        skipBlockerRef.current = true;
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
      skipBlockerRef.current = true;
      navigate(routeFamily ? `/routes/families/${routeFamily.id}` : "/routes");
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
    if (!confirmLosingBlockLayout("Adding a group")) return;
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
    if (!confirmLosingBlockLayout("Renaming a group")) return;
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
    if (!confirmLosingBlockLayout("Deleting a group")) return;

    setDeletingGroupId(groupId);
    try {
      await authFetch(() =>
        api.delete(`/admin/routes/${id}/groups/${groupId}`),
      );
      // Close editors for blocks in the deleted group
      setOpenEditors((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [key, state] of next) {
          if (state.groupId === groupId) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
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

  // ------- Drag & drop (unified for groups + blocks) -------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function isGroupId(id: string): boolean {
    return groups.some((g) => g.id === id);
  }

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
    if (!confirmLosingBlockLayout("Saving the group order")) return;
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

  function findGroupForBlock(blockId: string): string | undefined {
    return groups.find((g) => g.blocks.some((b) => b.id === blockId))?.id;
  }

  function findGroupForDroppable(droppableId: string): string | undefined {
    // Check if this is a droppable zone (empty group target)
    if (typeof droppableId === "string" && droppableId.startsWith("droppable-")) {
      return droppableId.replace("droppable-", "");
    }
    // Otherwise it's a block ID — find which group it belongs to
    return findGroupForBlock(droppableId);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (isGroupId(id)) {
      setActiveItemType("group");
    } else {
      setActiveItemType("block");
      setActiveBlockId(id);
      // A block with an open editor cannot be dragged (its handle is
      // disabled), so no unsaved edits can be discarded here.
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (activeItemType !== "block") return;
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceGroupId = findGroupForBlock(activeId);
    const targetGroupId = findGroupForDroppable(overId);

    if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) return;

    // Move block between groups in local state for visual feedback
    setGroups((prev) => {
      const sourceGroup = prev.find((g) => g.id === sourceGroupId);
      const targetGroup = prev.find((g) => g.id === targetGroupId);
      if (!sourceGroup || !targetGroup) return prev;

      const block = sourceGroup.blocks.find((b) => b.id === activeId);
      if (!block) return prev;

      const newSourceBlocks = sourceGroup.blocks.filter((b) => b.id !== activeId);

      // Find insertion index in target
      const overBlockIndex = targetGroup.blocks.findIndex((b) => b.id === overId);
      const newTargetBlocks = [...targetGroup.blocks];
      if (overBlockIndex >= 0) {
        newTargetBlocks.splice(overBlockIndex, 0, { ...block, group_id: targetGroupId });
      } else {
        newTargetBlocks.push({ ...block, group_id: targetGroupId });
      }

      return prev.map((g) => {
        if (g.id === sourceGroupId) return { ...g, blocks: newSourceBlocks };
        if (g.id === targetGroupId) return { ...g, blocks: newTargetBlocks };
        return g;
      });
    });
  }

  function handleBlockDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveBlockId(null);

    const activeId = String(active.id);

    // handleDragOver has already placed the block in its target group in local
    // state, so the group it sits in now is the drop target. Nothing here talks
    // to the API — the result is pending until "Save Block Layout".
    const currentGroupId = findGroupForBlock(activeId);
    if (!currentGroupId || !over) return;

    const overId = String(over.id);
    const group = groups.find((g) => g.id === currentGroupId);
    if (!group) return;

    const oldIndex = group.blocks.findIndex((b) => b.id === activeId);
    const newIndex = group.blocks.findIndex((b) => b.id === overId);
    // Dropping on an empty group's zone has no "over" block: the position set
    // by handleDragOver is already final.
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(group.blocks, oldIndex, newIndex).map(
      (b, i) => ({ ...b, position: i }),
    );

    setGroups((prev) =>
      prev.map((g) =>
        g.id === currentGroupId ? { ...g, blocks: reordered } : g,
      ),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const type = activeItemType;
    setActiveItemType(null);

    if (type === "group") {
      handleGroupDragEnd(event);
    } else if (type === "block") {
      handleBlockDragEnd(event);
    }
  }

  // Persist the pending block layout: cross-group moves first (so every group's
  // membership matches what is on screen), then a reorder per changed group to
  // pin the exact order. A group left empty by a move needs no reorder call —
  // the move endpoint renumbers the source group itself.
  async function handleSaveBlockLayout() {
    if (!blockLayout.hasChanges) return;
    const { moves, changedGroupIds, orderByGroupId } = blockLayout;

    setSavingBlockLayout(true);
    try {
      for (const move of moves) {
        await authFetch(() =>
          api.put(`/admin/blocks/${move.blockId}/move`, {
            target_group_id: move.toGroupId,
            position: move.position,
          }),
        );
      }

      for (const groupId of changedGroupIds) {
        const blockIds = orderByGroupId[groupId];
        if (!blockIds || blockIds.length === 0) continue;
        await authFetch(() =>
          api.put(`/admin/groups/${groupId}/blocks/reorder`, {
            block_ids: blockIds,
          }),
        );
      }

      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        alert(`Failed to save block layout: ${err.message}`);
      } else if (!(err instanceof ApiError)) {
        alert("An unexpected error occurred while saving the block layout.");
      }
      await fetchRoute();
    } finally {
      setSavingBlockLayout(false);
    }
  }

  // Any action that refetches the route replaces the on-screen layout with the
  // server's, so warn before one throws away pending block moves/reordering.
  function confirmLosingBlockLayout(action: string): boolean {
    if (!blockLayout.hasChanges) return true;
    return window.confirm(
      `You have unsaved block layout changes. ${action} reloads the route and discards them. Continue?`,
    );
  }

  async function handleDiscardBlockLayout() {
    if (!blockLayout.hasChanges) return;
    if (!window.confirm("Discard the unsaved block moves and reordering?")) {
      return;
    }
    await fetchRoute();
  }

  // ------- Block handlers (accordion editors) -------
  function openAddBlock(groupId: string) {
    setPickingBlockType(groupId);
  }

  function handlePickBlockType(type: BlockType) {
    if (!pickingBlockType) return;
    const key = `new-${pickingBlockType}`;
    setOpenEditors((prev) => {
      const next = new Map(prev);
      next.set(key, {
        groupId: pickingBlockType,
        form: emptyBlockForm(type),
        errors: {},
        saving: false,
        answerInput: "",
        uploadingImage: false,
      });
      return next;
    });
    setPickingBlockType(null);
  }

  function toggleBlockEditor(groupId: string, block: RouteBlock) {
    const key = block.id;
    if (openEditors.has(key)) {
      removeEditor(key);
    } else {
      setOpenEditors((prev) => {
        const next = new Map(prev);
        next.set(key, {
          groupId,
          form: blockToForm(block),
          errors: {},
          saving: false,
          answerInput: "",
          uploadingImage: false,
        });
        return next;
      });
    }
  }

  async function handleUploadBlockImage(editorKey: string, file: File) {
    const editor = openEditors.get(editorKey);
    if (!editor) return;

    const validation = imageUploadSchema.safeParse({
      type: file.type,
      size: file.size,
      filename: file.name,
    });
    if (!validation.success) {
      updateEditor(editorKey, {
        errors: {
          ...editor.errors,
          "config.image_url": validation.error.issues[0]?.message ?? "Invalid image",
        },
      });
      return;
    }

    updateEditor(editorKey, { uploadingImage: true });
    try {
      const uploadRes = await authFetch(() =>
        api.post<{ upload_url: string; key: string; url: string }>("/admin/upload", {
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
        updateEditor(editorKey, {
          errors: {
            ...editor.errors,
            "config.image_url": "Failed to upload image to storage",
          },
          uploadingImage: false,
        });
        return;
      }

      const currentEditor = openEditors.get(editorKey);
      if (currentEditor?.form.type === "image") {
        updateEditor(editorKey, {
          form: { ...currentEditor.form, image_url: uploadRes.url },
          uploadingImage: false,
        });
      } else {
        updateEditor(editorKey, { uploadingImage: false });
      }
    } catch (err) {
      updateEditor(editorKey, {
        errors: {
          ...editor.errors,
          "config.image_url": "Failed to upload image",
        },
        uploadingImage: false,
      });
    }
  }

  async function handleSaveBlock(editorKey: string) {
    const editor = openEditors.get(editorKey);
    if (!editor) return;
    if (!confirmLosingBlockLayout("Saving this block")) return;

    const payload = formToBlockPayload(editor.form);

    const configResult = blockConfigSchema.safeParse(payload.config);
    if (!configResult.success) {
      updateEditor(editorKey, { errors: zodFieldErrors(configResult.error) });
      return;
    }

    updateEditor(editorKey, { saving: true });
    try {
      if (editorKey.startsWith("new-")) {
        await authFetch(() =>
          api.post(`/admin/groups/${editor.groupId}/blocks`, payload),
        );
      } else {
        await authFetch(() =>
          api.put(`/admin/blocks/${editorKey}`, payload),
        );
      }
      removeEditor(editorKey);
      await fetchRoute();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        updateEditor(editorKey, {
          errors: { _form: err.message },
          saving: false,
        });
      } else if (!(err instanceof ApiError)) {
        updateEditor(editorKey, {
          errors: { _form: "An unexpected error occurred." },
          saving: false,
        });
      } else {
        updateEditor(editorKey, { saving: false });
      }
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!window.confirm("Are you sure you want to delete this block?")) return;
    if (!confirmLosingBlockLayout("Deleting a block")) return;

    setDeletingBlockId(blockId);
    try {
      await authFetch(() => api.delete(`/admin/blocks/${blockId}`));
      removeEditor(blockId);
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

  // Find active block for drag overlay
  const activeBlock = activeBlockId
    ? groups.flatMap((g) => g.blocks).find((b) => b.id === activeBlockId)
    : null;

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
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <Link to="/routes" className="text-blue-600 hover:text-blue-800">
          Routes
        </Link>
        {isEdit && routeFamily && (
          <>
            <span>/</span>
            <Link
              to={`/routes/families/${routeFamily.id}`}
              className="text-blue-600 hover:text-blue-800"
            >
              {routeFamily.name}
            </Link>
            <span>/</span>
            <span className="text-gray-700">
              {LANGUAGE_NAMES[route?.language as SupportedLanguage] ?? route?.language}
            </span>
          </>
        )}
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? "Edit Route" : "Create Route"}
        </h1>
        {isEdit && route && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
            {LANGUAGE_NAMES[route.language] ?? route.language}
          </span>
        )}
      </div>

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

          {/* City (create only — an existing route takes it from its family) */}
          {!isEdit && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                City *
              </label>
              <input
                type="text"
                value={routeForm.city}
                onChange={(e) => updateRouteField("city", e.target.value)}
                className={INPUT_CLS}
                placeholder="e.g. Edinburgh"
              />
              <p className="mt-1 text-xs text-gray-500">
                A new route family is created for this city.
              </p>
              {routeErrors.city && (
                <p className="mt-1 text-sm text-red-600">{routeErrors.city}</p>
              )}
            </div>
          )}

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

          {/* Unsaved block layout banner (moves + reordering) */}
          {blockLayout.hasChanges && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <span className="text-sm text-amber-900">
                <span className="font-medium">Unsaved block changes</span> in{" "}
                {blockLayout.changedGroupIds.length} group
                {blockLayout.changedGroupIds.length !== 1 ? "s" : ""}
                {blockLayout.moves.length > 0
                  ? ` (${blockLayout.moves.length} block${
                      blockLayout.moves.length !== 1 ? "s" : ""
                    } moved between groups)`
                  : ""}
                . Nothing is saved until you press Save.
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleSaveBlockLayout}
                  disabled={savingBlockLayout}
                  className={BTN_PRIMARY}
                >
                  {savingBlockLayout ? "Saving..." : "Save Block Layout"}
                </button>
                <button
                  onClick={handleDiscardBlockLayout}
                  disabled={savingBlockLayout}
                  className={BTN_SECONDARY}
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {groups.length === 0 ? (
            <p className="mb-4 text-sm text-gray-500">
              No groups yet. Add your first group below.
            </p>
          ) : (
            <div className="mb-4 space-y-3">
              {/* Unified DnD for groups + blocks */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
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

                        {/* Blocks list */}
                        {group.blocks.length === 0 ? (
                          <>
                            <DroppableGroupZone groupId={group.id} />
                            {changedGroupIdSet.has(group.id) && (
                              <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Unsaved block layout
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="mb-3 space-y-2">
                            <SortableContext
                              items={group.blocks.map((b) => b.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {group.blocks.map((block, blockIndex) => (
                                <SortableBlock
                                  key={block.id}
                                  block={block}
                                  index={blockIndex}
                                  isExpanded={openEditors.has(block.id)}
                                  onToggleExpand={() =>
                                    toggleBlockEditor(group.id, block)
                                  }
                                  onDelete={() => handleDeleteBlock(block.id)}
                                  isDeleting={deletingBlockId === block.id}
                                  editorState={openEditors.get(block.id)}
                                  onUpdateForm={(form) =>
                                    updateEditor(block.id, { form })
                                  }
                                  onUpdateErrors={(errors) =>
                                    updateEditor(block.id, { errors })
                                  }
                                  onSave={() => handleSaveBlock(block.id)}
                                  onCancel={() => removeEditor(block.id)}
                                  onUploadImage={(file) =>
                                    handleUploadBlockImage(block.id, file)
                                  }
                                  onSetAnswerInput={(v) =>
                                    updateEditor(block.id, { answerInput: v })
                                  }
                                />
                              ))}
                            </SortableContext>

                            {/* Pending layout indicator for this group */}
                            {changedGroupIdSet.has(group.id) && (
                              <div className="flex items-center gap-2 pt-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  Unsaved block layout
                                </span>
                                <button
                                  onClick={handleSaveBlockLayout}
                                  disabled={savingBlockLayout}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                >
                                  {savingBlockLayout ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={handleDiscardBlockLayout}
                                  disabled={savingBlockLayout}
                                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                >
                                  Discard
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

                        {/* New block editor (accordion for adding) */}
                        {openEditors.has(`new-${group.id}`) && (() => {
                          const newKey = `new-${group.id}`;
                          const editor = openEditors.get(newKey)!;
                          return (
                            <div className="mb-3 rounded-lg border border-blue-300 bg-blue-50 p-4">
                              <h4 className="mb-3 text-sm font-semibold text-gray-900">
                                Add {BLOCK_TYPE_META[editor.form.type].label} Block
                              </h4>

                              {editor.errors._form && (
                                <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                                  {editor.errors._form}
                                </div>
                              )}

                              <BlockEditorForm
                                form={editor.form}
                                setForm={(form) => updateEditor(newKey, { form })}
                                errors={editor.errors}
                                answerInput={editor.answerInput}
                                setAnswerInput={(v) =>
                                  updateEditor(newKey, { answerInput: v })
                                }
                                onUploadImage={(file) =>
                                  handleUploadBlockImage(newKey, file)
                                }
                                uploadingImage={editor.uploadingImage}
                              />

                              <div className="mt-4 flex items-center gap-3">
                                <button
                                  onClick={() => handleSaveBlock(newKey)}
                                  disabled={editor.saving}
                                  className={BTN_PRIMARY}
                                >
                                  {editor.saving ? "Saving..." : "Save Block"}
                                </button>
                                <button
                                  onClick={() => removeEditor(newKey)}
                                  className={BTN_SECONDARY}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Add block button */}
                        {pickingBlockType !== group.id &&
                          !openEditors.has(`new-${group.id}`) && (
                            <button
                              onClick={() => openAddBlock(group.id)}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              + Add Block
                            </button>
                          )}
                      </SortableGroup>
                    ))}

                    {/* Drag overlay */}
                    <DragOverlay>
                      {activeBlock ? <BlockOverlay block={activeBlock} /> : null}
                    </DragOverlay>
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
