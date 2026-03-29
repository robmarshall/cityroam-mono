# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 11.1 Add REFUNDED event status — add `'REFUNDED'` to the event status check constraint (new migration), update `EventStatus` type in shared types, add to `adminUpdateEventStatusSchema` validation, add status label/colour in admin `event-utils.ts` (e.g. red/orange badge)
- **Spec File**: N/A (described in IMPLEMENTATION_PLAN.md)
- **Stage**: commit
- **Started**: 2026-03-29T11:22:00.000Z
- **Last Heartbeat**: 2026-03-29T14:18:00.000Z
- **Inner Loop Count**: 5

## Stage Status
- [x] implement - Complete
- [x] test - Passed (257 tests, typecheck clean)
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Review: packages/app/src/pages/JoinPage.tsx:191-195 — `hasBlockingError` does not include refunded events. Add `error.includes("has been refunded")` so the join form is hidden when the event is refunded.
- [x] Review: packages/app/src/pages/JoinPage.tsx:45,109 — REFUNDED messages say "This event has been refunded" but all other player-facing copy uses "hunt" (e.g. "This hunt has expired"). Change to "This hunt has been refunded." in both locations.
- [x] Review: packages/api/src/routes/admin.ts:38-44 — Dashboard `counts` initializer missing `REFUNDED: 0`. REFUNDED events won't appear in admin dashboard status counts.
- [x] Review: packages/api/src/ws/auth.ts:114 — Reason string says "Event is completed or expired" but this branch now also covers REFUNDED. Update to "Event is completed, expired, or refunded".
- [x] Review: packages/api/src/services/event-expiry.ts:14 — Comment says "not already COMPLETED or EXPIRED" but code now also excludes REFUNDED. Update comment.

## Files Modified
- packages/shared/src/types/enums.ts (modified) — added REFUNDED to EventStatus type
- packages/shared/src/validation/admin-input.ts (modified) — added REFUNDED to adminUpdateEventStatusSchema
- packages/api/src/db/schema/events.ts (modified) — added REFUNDED to check constraint
- packages/api/drizzle/0001_mature_iron_monger.sql (new) — migration to update check constraint
- packages/api/drizzle/meta/0001_snapshot.json (new) — migration snapshot
- packages/api/drizzle/meta/_journal.json (modified) — migration journal entry
- packages/admin/src/lib/event-utils.ts (modified) — added REFUNDED label (orange badge) and status order
- packages/api/src/services/event-expiry.ts (modified) — exclude REFUNDED from expiry sweep
- packages/api/src/routes/events.ts (modified) — exclude REFUNDED from lazy expiry, reject join for refunded events
- packages/api/src/ws/auth.ts (modified) — reject WS connections for refunded events
- packages/app/src/pages/JoinPage.tsx (modified) — handle REFUNDED status and EVENT_REFUNDED error code
- packages/api/src/routes/admin.ts (modified) — added REFUNDED: 0 to dashboard counts initializer

## Iteration Log
- Loop 1: Starting implementation
- Loop 2: Implemented REFUNDED status across all layers: shared types, validation schema, DB schema + migration, admin UI labels/colors, API expiry exclusion, join endpoint rejection, WS auth rejection, and player-facing error handling. All packages type-check cleanly.
- Loop 2 (test): Tests passed (180 API + 77 shared = 257 total), typecheck passed. Advancing to review.
- Loop 2 (review): Review found issues — JoinPage hasBlockingError doesn't cover REFUNDED (form stays visible), and REFUNDED messages use "event" instead of "hunt". Looping back to implement.
- Loop 3: Fixed both review TODOs in JoinPage.tsx — added "has been refunded" to hasBlockingError check, changed both REFUNDED messages from "event" to "hunt" for consistency with player-facing copy.
- Loop 4 (test): Tests passed (180 API + 77 shared = 257 total), typecheck passed. Advancing to review.
- Loop 4 (review): Review found issues — admin dashboard counts missing REFUNDED init, WS auth reason string doesn't mention REFUNDED, expiry comment outdated. Looping back to implement.
- Loop 5: Fixed all 3 remaining review TODOs — added REFUNDED:0 to dashboard counts, updated WS auth reason string, updated expiry comment.
- Loop 5 (test): Tests passed (180 API + 77 shared = 257 total), typecheck passed. Advancing to review.
- Loop 5 (review): Review passed — all previous TODOs confirmed fixed, no new issues found. Advancing to commit.

## Blockers
(none)
