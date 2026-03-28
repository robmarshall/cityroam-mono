# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 8.5 Route & stop editor — route form (shared routeSchema validation, auto-calculated total_stops), stops list with drag reorder, stop editor (tag/chip input for accepted_answers, ordered hints 2-3, image upload to S3 with preview, google_maps_link)
- **Spec File**: project-spec.md §8.1 (Admin Views)
- **Stage**: commit
- **Started**: 2026-03-28T00:00:00Z
- **Last Heartbeat**: 2026-03-28T18:52:00Z
- **Inner Loop Count**: 13

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Complete

## TODOs (feed back to implement)
- [x] Review: RouteEditorPage.tsx:~447 - Drag-and-drop bug: handleDragStart/handleDragEnter capture indices from the rendered `sortedStops` array, but handleDrop splices the `stops` state array. When stops come back from API in different order than stop_number, drag reorders wrong items. Fix: operate on sortedStops or map sorted indices back to stops indices.
- [x] Review: RouteEditorPage.tsx:~347-353 - S3 upload fetch response not checked for success. If PUT to S3 fails (403, 500), the key is still added to images list, creating a phantom image reference. Add `if (!response.ok)` check.
- [x] Review: DashboardPage.tsx:~8-41 - Duplicates `formatDate`, `STATUS_LABELS`, `STATUS_COLORS`, `STATUS_ORDER` locally instead of importing from `../lib/event-utils` like EventsListPage and EventDetailPage do. Will cause display drift if either copy is updated.
- [x] Review: admin.ts:~503-510 - Race condition: `maxStopResult` query to determine `nextStopNumber` runs outside the transaction. Two concurrent stop-create requests on the same route could read the same max and insert duplicate stop_numbers. Move the max query inside the transaction.
- [x] Review: RoutesListPage.tsx:~117-119 - `route.estimated_duration_mins` and `route.estimated_distance_km` render as `null mins` / `undefined km` when values are null. Add null guards with fallback display (e.g., `?? '—'`).
- [x] Review: RouteEditorPage.tsx - Multiple catch blocks only handle `ApiError` instances; non-ApiError exceptions (network errors, JSON parse failures) are silently swallowed with no user feedback. Add fallback error handling in catch blocks.
- [x] Review: RouteEditorPage.tsx:~486 - handleDrop non-ApiError catch branch calls alert() but does NOT call fetchRoute() to revert the optimistic reorder. The UI remains out of sync with the server. Add `await fetchRoute()` after the alert.
- [x] Review: RoutesListPage.tsx:~117,120 - Null guard fix incomplete: renders "— mins" / "— km" because the unit suffix is unconditionally appended. Should conditionally render the full string including unit, e.g. `{route.estimated_duration_mins != null ? `${route.estimated_duration_mins} mins` : "—"}`.
- [x] Review: admin.ts:~579-611 - Reorder endpoint reads routeStops outside the transaction for validation, then updates inside tx. Concurrent add/delete between read and tx could make validation pass on stale data. Move the routeStops query inside the transaction.

## Files Modified
- packages/admin/src/pages/RoutesListPage.tsx (modified)
- packages/admin/src/pages/RouteEditorPage.tsx (modified)
- packages/api/src/routes/admin.ts (modified)
- packages/admin/src/pages/DashboardPage.tsx (modified)
- packages/admin/src/pages/EventDetailPage.tsx (modified)
- packages/admin/src/pages/EventsListPage.tsx (modified)

## Iteration Log
- Loop 1: Starting implementation of route & stop editor
- Loop 2: Implemented RoutesListPage (routes table with name, city, stops, duration, distance, active badge, created date, create button) and RouteEditorPage (route form with Zod validation, stops list with HTML5 drag-and-drop reorder, inline stop form with tag/chip input for accepted_answers, 2-3 ordered hints, S3 image upload via presigned URLs, google_maps_link, and full CRUD operations). Fixed API response shape for route creation and removed unnecessary zod type import.
- Loop 3: Build failed — implicit `any` type errors in admin.ts:601-602 (map/reduce params) and RoutesListPage.tsx:101 (map param). Looping back to implement.
- Loop 4: Fixed all TS7006 implicit `any` errors: added explicit types to admin.ts map/reduce (string, number, SQL), RoutesListPage route param (Route & { stop_count: number }), and also fixed 3 pre-existing implicit any errors in DashboardPage, EventsListPage, and EventDetailPage with proper type annotations.
- Loop 5: Build failed — RouteEditorPage.tsx:203,385 TS2345: `zodFieldErrors` function param type has `path: (string | number)[]` but Zod v4 `ZodError.issues` has `path: PropertyKey[]` (symbol not assignable). Also fixed broken workspace symlinks (were pointing to /mnt/host/... host path). Looping back to implement.
- Loop 6: Fixed `zodFieldErrors` param type to use `PropertyKey[]` for Zod v4 compatibility. Verified workspace symlinks are correct. TypeScript build passes cleanly.
- Loop 6 (test): Build passed, all 235 tests passed (158 api + 77 shared), typecheck clean. Advancing to review.
- Loop 7 (review): Review found 3 issues — drag-and-drop reorder bug (sorted vs unsorted index mismatch), unchecked S3 upload response, DashboardPage duplicating shared utilities. Looping back to implement.
- Loop 8: Fixed all 3 review issues: (1) drag-and-drop now operates on sortedStops so indices match rendered order, (2) S3 upload response checked with `if (!uploadResponse.ok)` before adding key, (3) DashboardPage now imports STATUS_LABELS/STATUS_COLORS/STATUS_ORDER/formatDate from event-utils instead of duplicating. Typecheck passes clean.
- Loop 9 (test): Build passed, all 235 tests passed (158 api + 77 shared), typecheck clean. Advancing to review.
- Loop 10 (review): Review found 3 issues — stop-create race condition (max query outside tx), null rendering on RoutesListPage, silent error swallowing in RouteEditorPage. Looping back to implement.
- Loop 11: Fixed all 3 review issues: (1) moved maxStopResult query inside transaction to prevent race condition on concurrent stop creation, (2) added null guards with '—' fallback for estimated_duration_mins/estimated_distance_km on RoutesListPage, (3) added fallback error handling to all catch blocks in RouteEditorPage for non-ApiError exceptions. Typecheck passes clean.
- Loop 12 (test): Build passed, all 235 tests passed (158 api + 77 shared), typecheck clean. Advancing to review.
- Loop 13 (review): Review found 3 issues — missing fetchRoute() on non-ApiError reorder failure, incomplete null guard unit suffix on RoutesListPage, reorder validation outside transaction. Looping back to implement.
- Loop 14: Fixed all 3 review issues: (1) added `await fetchRoute()` after alert in handleDrop non-ApiError catch to revert optimistic UI, (2) fixed null guard to use ternary so unit suffix is conditional: `value != null ? \`${value} mins\` : "—"`, (3) moved routeStops validation query inside the reorder transaction to prevent TOCTOU race. Typecheck passes clean.
- Loop 15 (test): Build passed, all 235 tests passed (158 api + 77 shared), typecheck clean. Advancing to review.
- Loop 16 (review): Review passed — all 9 previously flagged issues verified fixed, no new actionable issues found. Advancing to commit.

## Blockers
(none)
