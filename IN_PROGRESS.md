# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 14.1 Drag-and-drop stop reorder with dnd-kit
- **Spec File**: N/A (described in IMPLEMENTATION_PLAN.md)
- **Stage**: commit
- **Started**: 2026-03-29T00:00:00Z
- **Last Heartbeat**: 2026-03-29T14:06:00Z
- **Inner Loop Count**: 5

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Review: packages/admin/src/pages/RouteEditorPage.tsx:582-583 - `arrayMove` reorders the array but does not update `stop_number` on each item. The render at line 637-638 re-sorts by `stop_number`, which reverts the drag result. Fix: after `arrayMove`, update `stop_number` on each item to match its new index, e.g. `.map((s, i) => ({ ...s, stop_number: i + 1 }))`
- [x] Review: packages/admin/src/pages/RouteEditorPage.tsx:567 - PointerSensor has no activation constraint. Any slight mouse movement during a click on the drag handle initiates a drag, hurting usability. Fix: add `{ activationConstraint: { distance: 8 } }` to require 8px movement before drag starts.
- [x] Review: packages/admin/src/pages/RouteEditorPage.tsx:606-608 - When `handleSaveOrder` fails with a non-401 ApiError, the error is silently swallowed (re-fetches but shows no feedback to user). Fix: show an error message (e.g. `alert("Failed to save stop order.")`) before re-fetching, consistent with the non-ApiError branch.

## Files Modified
- packages/admin/package.json (modified)
- packages/admin/src/pages/RouteEditorPage.tsx (modified)
- package-lock.json (modified)

## Iteration Log
- Loop 1: Installed @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities. Replaced HTML5 native drag-and-drop with dnd-kit SortableContext + useSortable. Extracted SortableStop component with dedicated drag handle (grip dots icon). Changed from auto-save on drop to local-only reorder with "Save Order" / "Cancel" buttons that appear when order differs from saved state. Uses savedStopIds ref to track server-persisted order. Stop numbers now display positional index (1-based) reflecting drag order. TypeScript compiles clean, Vite build succeeds.
- Loop 1 test: All 257 tests passed (180 API, 77 shared), typecheck passed. Build succeeded for all modified packages (admin, api, shared, app). Marketing build has pre-existing EACCES permission error unrelated to this task.
- Loop 1 review: Found bug — `arrayMove` does not update `stop_number` on items, causing `sortedStops` sort at render to revert drag order. Looping back to implement.
- Loop 2: Fixed `handleDragEnd` — after `arrayMove`, now maps over reordered array to set `stop_number: i + 1` on each item, ensuring `sortedStops` sort preserves drag order. Typecheck clean.
- Loop 2 test: All 257 tests passed (180 API, 77 shared), typecheck passed. Build succeeded for admin, api, shared, app. Marketing build has pre-existing EACCES permission error unrelated to this task.
- Loop 2 review: Found 2 issues — (1) PointerSensor missing activation distance constraint causing accidental drags, (2) silent error swallowing on reorder save failure. Looping back to implement.
- Loop 3: Added `{ activationConstraint: { distance: 8 } }` to PointerSensor and added `alert("Failed to save stop order.")` for non-401 ApiError case. Typecheck clean.
- Loop 3 test: All 257 tests passed (180 API, 77 shared), typecheck passed. Build succeeded for admin, api, shared, app. Marketing build has pre-existing EACCES permission error unrelated to this task.
- Loop 3 review: Review passed — all three previous fixes verified (stop_number remapping, PointerSensor distance constraint, error alert). No security, quality, or spec compliance issues found.

## Blockers
(none)
