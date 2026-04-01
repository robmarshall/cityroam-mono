# Implementation Plan — Route Builder Refactor: Block-Based Architecture

## Status Key
- [ ] Not started
- [~] In progress
- [x] Complete

---

## Overview

Refactor the route model from a flat list of stops into a composable **group + block** architecture. Routes are made of ordered **groups** (logical sections), each containing ordered **blocks** (message, image, question, action, map). This replaces the stops-only model and the separate opening message system, making routes fully authorable with flexible content flow.

---

## Phase 1: Revert Previous Iteration

- [x] **1.1 Revert opening sequences** — Delete `packages/api/src/db/schema/opening-sequences.ts`, `packages/admin/src/pages/OpeningSequencesPage.tsx`. Remove opening sequence admin API routes from `admin.ts`. Remove opening sequence nav link from `AdminLayout.tsx` and route from `router.tsx`. Remove generated migration `0004_workable_bloodscream.sql`.
- [x] **1.2 Revert stop/hint changes** — Restore `stopSchema.hints` to `z.array(z.string())`, restore `Stop.hints` to `string[]`, restore `stopToForm`/hint editor in `RouteEditorPage.tsx`, restore hint handler to use `string[]`, restore test fixtures to use `string[]` hints.
- [x] **1.3 Revert event start handler** — Restore original opening message bank logic in `events.ts` (messageBanks import, template selection, image message).
- [x] **1.4 Keep useful additions** — Keep `sendSequence()` utility (`packages/api/src/services/send-sequence.ts`), keep `Linkify` component in `ChatPage.tsx`, keep `SequenceItem` type in shared.

## Phase 2: Shared Types & Validation

- [x] **2.1 Block config types** — Create `packages/shared/src/types/blocks.ts` with discriminated union types for each block config.
- [x] **2.2 Entity types** — Add `RouteGroup` and `RouteBlock` interfaces to `entities.ts`. Export from `types/index.ts`.
- [x] **2.3 API response types** — Add `AdminRouteDetailResponse` update to include groups/blocks. Add block-level response types to `api.ts`.
- [x] **2.4 Validation schemas** — Add `routeGroupSchema`, `routeBlockSchema` (with per-type config validation), reorder schemas.
- [x] **2.5 WebSocket types** — Add `ActionConfirmPayload`, `ActionWaitingPayload` to websocket types. Add `action_confirm` and `action_waiting` types.

## Phase 3: Database Schema & Migration

- [x] **3.1 route_groups schema** — Create `packages/api/src/db/schema/route-groups.ts`: id, route_id (FK cascade), position, name, created_at, updated_at. Index on route_id.
- [x] **3.2 route_blocks schema** — Create `packages/api/src/db/schema/route-blocks.ts`: id, group_id (FK cascade), position, type (varchar), config (jsonb), delay_ms (integer), created_at. Index on group_id.
- [x] **3.3 Events table changes** — Add `current_group_id` (uuid FK nullable) and `current_block_id` (uuid FK nullable) to events table. Keep `current_stop` temporarily for migration.
- [x] **3.4 Export new tables** — Update `packages/api/src/db/schema/index.ts`.
- [x] **3.5 Generate migration** — Run `drizzle-kit generate`. Then add data migration SQL:
  - For each existing stop: create a route_group, then create blocks (message for directions, image blocks, question block with clue/answers/hints, message for fun_fact)
  - Migrate `current_stop` on active events to corresponding `current_group_id` + `current_block_id`
  - Drop `stops` table and `current_stop` column (or defer to a later migration)

## Phase 4: Game Engine — Group Runner

- [x] **4.1 Group runner service** — Create `packages/api/src/services/group-runner.ts`:
  - `runGroup(eventId, eventCode, groupId)` — loads blocks in order, iterates:
    - `message` block: apply template vars, call `writeGuideMessage()`
    - `image` block: call `writeGuideMessage("", imageUrl)`
    - `map` block: send as guide message with map link
    - `question` block: update `current_block_id` on event, return (pauses for user interaction)
    - `action` block: update `current_block_id` on event, publish `action_waiting` control event, return (pauses for lead confirmation)
    - For auto-send blocks: show typing indicator during delay, then send
  - `advanceAfterBlock(eventId, eventCode, blockId)` — called after question answered or action confirmed, continues sending remaining blocks in group, then advances to next group
  - Reuse `sendSequence()` for hint delivery within question blocks

- [x] **4.2 Template variable system** — Extract template var replacement into a shared helper. Variables available: `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`, `{{REVIEW_LINK}}`, etc. Applied to message block content.

## Phase 5: Game Engine — Pipeline Updates

- [x] **5.1 Orchestrator** — Update `orchestrator.ts` to load current question block (via `current_block_id`) instead of current stop. Extract clue, accepted_answers, hints from `block.config`.
- [x] **5.2 Answer attempt handler** — Update `answer-attempt.ts`: load question block config instead of stop data. On correct answer, call `advanceAfterBlock()` instead of manually sending fun fact + directions + next clue.
- [x] **5.3 Hint request handler** — Update `hint-request.ts`: load hints from question block config. Use `sendSequence()` for multi-message hints. On exhaustion, call `advanceAfterBlock()`.
- [x] **5.4 Game completion** — Update `game-completion.ts`: triggered by group-runner when last group's last block completes.
- [x] **5.5 Event start handler** — Rewrite `POST /event/:code/start` in `events.ts`: set event to IN_PROGRESS, set `current_group_id` to first group, fire `runGroup()` async, return 200.

## Phase 6: WebSocket — Action Block Support

- [x] **6.1 Action confirm handler** — In `ws/handlers.ts`, handle `action_confirm` message type: verify sender is lead, verify block_id matches `current_block_id`, call `advanceAfterBlock()`.
- [x] **6.2 Control event types** — Add `action_waiting` to `ControlEventPayload` union in redis types. Add to WebSocket subscription handler in `ws/subscriptions.ts`.
- [x] **6.3 ChatMessagePayload update** — Add optional `block_type` field to `ChatMessagePayload` so the client can render action/map blocks differently.

## Phase 7: Admin API

- [x] **7.1 Route detail response** — Update `GET /admin/routes/:id` to return groups with nested blocks alongside legacy stops.
- [x] **7.2 Group CRUD** — Add endpoints: `POST /admin/routes/:id/groups`, `PUT /admin/routes/:id/groups/:groupId`, `DELETE /admin/routes/:id/groups/:groupId`.
- [x] **7.3 Block CRUD** — Add endpoints: `POST /admin/groups/:groupId/blocks`, `PUT /admin/blocks/:blockId`, `DELETE /admin/blocks/:blockId`.
- [x] **7.4 Reorder endpoints** — `PUT /admin/routes/:id/groups/reorder` (group positions), `PUT /admin/groups/:groupId/blocks/reorder` (block positions within group).
- [x] **7.5 Bulk create update** — Added `POST /admin/routes/bulk-groups` for group-based bulk create (old bulk endpoint kept for compat).
- [x] **7.6 Remove stop endpoints** — Stop endpoints retained during migration period; will be removed when Phase 8 replaces the admin UI.

## Phase 8: Admin UI — Route Editor Rewrite

- [x] **8.1 Route editor structure** — Rewrite `RouteEditorPage.tsx` with group-based layout: route metadata form at top, ordered collapsible groups, blocks within groups, drag-to-reorder via @dnd-kit, explicit Save buttons (no autosave).
- [x] **8.2 Block type picker** — "Add Block" button within each group opens a picker with all 5 block types (Message, Image, Question, Action, Map) with distinct colored icon badges.
- [x] **8.3 Block editors** — Type-specific editor forms for all block types with delay_ms input and preset buttons.
- [x] **8.4 Group management** — Add group (inline name input), rename group (inline form), delete group (with confirmation), reorder groups (drag-and-drop with save/cancel).
- [x] **8.5 Remove old stop editor** — Removed all stop-specific form code, StopForm type, stop helper functions, stop CRUD handlers, and stop drag-and-drop.

## Phase 9: Player App — New Block Renderers

- [x] **9.1 Action block rendering** — When `action_waiting` control event arrives, show a button bubble in the chat. Only the lead sees an interactive button; others see "Waiting for [lead name]...". On press, send `action_confirm` WebSocket message.

- [x] **9.2 Map block rendering** — When a message with `block_type: 'map'` arrives, render as a styled map link card (icon + "View on Google Maps" link) instead of plain text.

- [x] **9.3 Linkify** — Already done in previous iteration. URLs in all message bubbles are clickable.

## Phase 10: Testing & Cleanup

- [x] **10.1 Update test fixtures** — Update all test helpers and fixtures to use groups/blocks instead of stops. [COMPLETE]
- [x] **10.2 Pipeline tests** — Update orchestrator, answer-attempt, hint-request, game-completion tests for block-based flow. [COMPLETE]
- [x] **10.3 Admin API tests** — Update admin route tests for group/block CRUD. [COMPLETE]
- [x] **10.4 Remove dead code** — Remove stops table references, old stop CRUD code, opening sequence code. Clean up imports. [COMPLETE]
- [x] **10.5 Update LLM authoring docs** — Update `docs/llm-authoring/` to reflect new groups/blocks data model and API format.

---

## Learnings

- **ESM imports**: All `.ts` files under `packages/shared/src/types/` must use `.js` extensions in import paths (e.g. `'./sequence.js'`). This is the established convention and required for Node ESM resolution.
- **Validation consistency**: Existing Zod schemas use `.trim().min(1)` for required string fields. New schemas must follow the same pattern.
- **Redundant discriminants**: When an entity has both a top-level `type` field and a `config` with its own `type` discriminant, the Zod schema must enforce they match (via `.refine()`) or derive one from the other.
- **URL field validation**: Existing URL fields (e.g. `stopSchema.google_maps_link`) don't use `.trim()` before `.url()`. New URL fields should follow the same pattern for consistency, but this is a codebase-wide improvement candidate.
- **Max length limits**: Most string fields in existing schemas (city, name, clue) lack max length constraints. Only `refund_note` and `routeGroupSchema.name` have them. Future phases should consider adding max lengths consistently across all user-input string fields.
- **Position gaps in migration**: The data migration from stops to blocks may leave position gaps (e.g. position 0 skipped if no directions). This is fine — the group runner should ORDER BY position rather than assume contiguous values.
- **No unique constraint on position**: Unlike stops' `(route_id, stop_number)` unique constraint, route_groups and route_blocks intentionally omit position uniqueness to simplify reorder operations at the application level.
- **Template vars canonical pattern**: `template-vars.ts` centralizes template variable building. Future phases (5.1 orchestrator, 5.5 event start) should migrate inline `.replace()` chains to use `applyTemplateVars` + `buildRouteTemplateVars` instead of duplicating the logic.
- **Phase 5 test rewrite pattern**: When refactoring handlers from stop-based to block-based, tests need: (1) replace `stops.findFirst` mocks with `routeBlocks.findFirst`, (2) add mocks for `group-runner` (advanceAfterBlock), `send-sequence` (sendSequence), `template-vars` (buildRouteTemplateVars), (3) update context helpers to include `currentBlockId`/`currentGroupId`, (4) replace `makeMockStop` with `makeMockQuestionBlock`. Counter-based mock sequencing (mockResolvedValueOnce chains) is fragile but works when call order is deterministic.
- **Mock reset discipline**: When adding new `query.*` mocks to the mock DB object, always add corresponding `.mockReset()` calls in `beforeEach`. Missing resets cause inter-test state leakage that can mask real failures.
- **QuestionBlockConfig consistency**: Always use `as QuestionBlockConfig` (from `@cityroam/shared`) when casting block config for question blocks. Avoid inline type assertions like `as { clue?: string }` — the shared type is the canonical source of truth and is used consistently across orchestrator.ts and all handler files.
- **Dead code removal thoroughness**: When removing a major entity (like stops), check comments, mock helpers, seed data, and test data paths across all packages — not just the schema and route files. Stale references often hide in test helpers (mock factories), S3 path strings in test data, and inline comments that reference old architecture.

---

# Implementation Plan — Block Interactions After Event Completion

## Status Key
- [ ] Not started
- [~] In progress
- [x] Complete

---

## Overview

When an event reaches a terminal state (COMPLETED, EXPIRED, REFUNDED), old game links can still be used to interact with the API. Sessions persist in Redis for 24h after completion, and several endpoints have no status guards. This adds two-layer defense: proactive session invalidation on completion + defensive status checks on all remaining endpoints.

### What Already Works
- WebSocket auth rejects terminal events with close code 4004 (`ws/auth.ts`)
- Pipeline orchestrator silently drops messages for non-IN_PROGRESS events (`orchestrator.ts`)
- `POST /join` blocks terminal events with 410
- App treats close code 4004 as fatal (no reconnect)

---

## Phase 1: Session Invalidation Infrastructure

- [ ] **1.1 Add `deleteSessionsByEventId`** — In `packages/api/src/redis/session.ts`, add a function that queries all participant tokens for an event from the DB, then bulk-deletes their Redis `session:{token}` keys. Import `db` and `participants` schema.
- [ ] **1.2 Export new function** — Export `deleteSessionsByEventId` from `packages/api/src/redis/index.ts`.

## Phase 2: Block Session Re-population

- [ ] **2.1 Guard DB fallback in session middleware** — In `packages/api/src/middleware/session.ts`, update the DB fallback path of `resolveSession` to also fetch `event.status`. If the event is in a terminal state (COMPLETED, EXPIRED, REFUNDED), return `null` instead of re-populating Redis. This closes the loophole where deleted sessions get silently recreated.

## Phase 3: Guard Unprotected HTTP Endpoints

- [ ] **3.1 Add `TERMINAL_STATUSES` set** — At the top of `packages/api/src/routes/events.ts`, define `const TERMINAL_STATUSES = new Set(["COMPLETED", "EXPIRED", "REFUNDED"])`.
- [ ] **3.2 Guard `GET /event/:code/messages`** — After the event lookup, return 410 with `EVENT_COMPLETED` if the event is in a terminal state.
- [ ] **3.3 Guard `POST /event/:code/name`** — After session validation, look up event status and return 410 if terminal.
- [ ] **3.4 Guard `POST /event/:code/leave`** — After event lookup, return 410 if terminal.

## Phase 4: Reduce Data Exposure on GET /event/:code

- [ ] **4.1 Strip participant data for terminal events** — In `GET /event/:code`, when the event is in a terminal state, return `participants: []`, `current_participant: null`, `lead_name: null`. Keep returning status and timestamps so the app can detect the state.

## Phase 5: Invalidate Sessions on State Transitions

- [ ] **5.1 On game completion** — In `packages/api/src/services/pipeline/handlers/game-completion.ts`, call `deleteSessionsByEventId(ctx.eventId)` after the DB update that sets status to COMPLETED.
- [ ] **5.2 On admin refund** — In `packages/api/src/routes/admin.ts`, call `deleteSessionsByEventId(id)` after both paths that set status to REFUNDED.
- [ ] **5.3 On lazy expiry** — In `packages/api/src/routes/events.ts`, call `deleteSessionsByEventId(event.id)` after the lazy expiry update.

## Phase 6: Strip Participant Tokens from Admin API

- [ ] **6.1 Remove tokens from admin event detail** — In `packages/api/src/routes/admin.ts` (line 281), remove `token: p.token` from the participant mapping in `GET /admin/events/:id`. Admin should never need raw session tokens — they can see participant names, status, and timestamps without them.

## Phase 7: App Handling of Terminal Event States

- [ ] **7.1 LobbyPage: handle EXPIRED/REFUNDED** — In `packages/app/src/pages/LobbyPage.tsx` (line 49-56), add redirects for `EXPIRED` and `REFUNDED` statuses. Currently only handles `IN_PROGRESS` and `COMPLETED`. Redirect to `/event/${code}` (JoinPage) which already shows appropriate error messages for these states.
- [ ] **7.2 ChatPage: handle 410 responses** — In `packages/app/src/pages/ChatPage.tsx`, add handling for 410 status from API calls (e.g. message fetch). When received, redirect to a terminal state screen or show "This game has ended" rather than a generic error.
- [ ] **7.3 App API client: detect 410 status** — In `packages/app/src/lib/api.ts`, add specific detection for 410 (Gone) responses so pages can distinguish "event ended" from other errors.

## Phase 8: Race Condition Guards

- [ ] **8.1 Atomic lead election on join** — In `packages/api/src/routes/events.ts` (line 167-196), wrap the participant count check + insert + event update in a DB transaction. Use `SELECT ... FOR UPDATE` on the event row to serialize concurrent joins, preventing two participants from both becoming lead.
- [ ] **8.2 Atomic event start** — In `packages/api/src/routes/events.ts` (line 267-323), use a transaction with `SELECT ... FOR UPDATE` on the event row when checking `status === "WAITING"` and updating to `IN_PROGRESS`. This prevents double-start from concurrent requests.

## Learnings

- **DRY for status sets**: When multiple files need the same set of terminal statuses, define it once in a shared location (e.g. shared constants or a single API-level constants file) and import it. Duplicating `new Set(["COMPLETED", "EXPIRED", "REFUNDED"])` across `events.ts` and `session.ts` creates a maintenance trap.
- **Use defined constants consistently**: If a constant like `TERMINAL_STATUSES` is defined in a file, use it everywhere in that file. The lazy expiry check in `events.ts` used an inline if-chain instead of the Set defined 20 lines above — always prefer the named constant.
- **Non-fatal session invalidation**: `deleteSessionsByEventId` calls should be wrapped in try/catch at all call sites. Redis failure should not block the primary operation (DB status update) since sessions TTL naturally. Log the error and continue.
- **Session invalidation ordering**: Always invalidate sessions AFTER all DB writes complete (status update + any follow-up inserts like completion messages). If invalidation happens before a subsequent DB write fails, sessions are gone but the state transition didn't complete.
- **Admin endpoints vs player endpoints**: Terminal status guards on admin endpoints are a separate concern from blocking player interactions. Admins may legitimately need to modify event states (e.g., refund a completed event). Don't conflate the two.
