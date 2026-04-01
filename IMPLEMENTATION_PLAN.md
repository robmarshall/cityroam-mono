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

- [ ] **2.1 Block config types** — Create `packages/shared/src/types/blocks.ts` with discriminated union types for each block config:
  - `MessageBlockConfig { content: string }`
  - `ImageBlockConfig { image_url: string }`
  - `QuestionBlockConfig { clue: string, accepted_answers: string[], hints: SequenceItem[][] }`
  - `ActionBlockConfig { label: string }`
  - `MapBlockConfig { google_maps_link: string }`
  - `BlockType = 'message' | 'image' | 'question' | 'action' | 'map'`
- [ ] **2.2 Entity types** — Add `RouteGroup` and `RouteBlock` interfaces to `entities.ts`. Export from `types/index.ts`.
- [ ] **2.3 API response types** — Add `AdminRouteDetailResponse` update to include groups/blocks instead of stops. Add block-level response types to `api.ts`.
- [ ] **2.4 Validation schemas** — Add `routeGroupSchema`, `routeBlockSchema` (with per-type config validation), `bulkRouteCreateSchema` update to accept groups/blocks. Keep `sequenceItemSchema` for hint validation within question blocks.
- [ ] **2.5 WebSocket types** — Add `ActionConfirmPayload`, `ActionWaitingPayload` to websocket types. Add `action_confirm` to client message types. Add `action_waiting` to control event types.

## Phase 3: Database Schema & Migration

- [ ] **3.1 route_groups schema** — Create `packages/api/src/db/schema/route-groups.ts`: id, route_id (FK cascade), position, name, created_at, updated_at. Index on route_id.
- [ ] **3.2 route_blocks schema** — Create `packages/api/src/db/schema/route-blocks.ts`: id, group_id (FK cascade), position, type (varchar), config (jsonb), delay_ms (integer), created_at. Index on group_id.
- [ ] **3.3 Events table changes** — Add `current_group_id` (uuid FK nullable) and `current_block_id` (uuid FK nullable) to events table. Keep `current_stop` temporarily for migration.
- [ ] **3.4 Export new tables** — Update `packages/api/src/db/schema/index.ts`.
- [ ] **3.5 Generate migration** — Run `drizzle-kit generate`. Then add data migration SQL:
  - For each existing stop: create a route_group, then create blocks (message for directions, image blocks, question block with clue/answers/hints, message for fun_fact)
  - Migrate `current_stop` on active events to corresponding `current_group_id` + `current_block_id`
  - Drop `stops` table and `current_stop` column (or defer to a later migration)

## Phase 4: Game Engine — Group Runner

- [ ] **4.1 Group runner service** — Create `packages/api/src/services/group-runner.ts`:
  - `runGroup(eventId, eventCode, groupId)` — loads blocks in order, iterates:
    - `message` block: apply template vars, call `writeGuideMessage()`
    - `image` block: call `writeGuideMessage("", imageUrl)`
    - `map` block: send as guide message with map link
    - `question` block: update `current_block_id` on event, return (pauses for user interaction)
    - `action` block: update `current_block_id` on event, publish `action_waiting` control event, return (pauses for lead confirmation)
    - For auto-send blocks: show typing indicator during delay, then send
  - `advanceAfterBlock(eventId, eventCode, blockId)` — called after question answered or action confirmed, continues sending remaining blocks in group, then advances to next group
  - Reuse `sendSequence()` for hint delivery within question blocks

- [ ] **4.2 Template variable system** — Extract template var replacement into a shared helper. Variables available: `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`, `{{REVIEW_LINK}}`, etc. Applied to message block content.

## Phase 5: Game Engine — Pipeline Updates

- [ ] **5.1 Orchestrator** — Update `orchestrator.ts` to load current question block (via `current_block_id`) instead of current stop. Extract clue, accepted_answers, hints from `block.config`.
- [ ] **5.2 Answer attempt handler** — Update `answer-attempt.ts`: load question block config instead of stop data. On correct answer, call `advanceAfterBlock()` instead of manually sending fun fact + directions + next clue.
- [ ] **5.3 Hint request handler** — Update `hint-request.ts`: load hints from question block config. Use `sendSequence()` for multi-message hints. On exhaustion, call `advanceAfterBlock()`.
- [ ] **5.4 Game completion** — Update `game-completion.ts`: triggered by group-runner when last group's last block completes.
- [ ] **5.5 Event start handler** — Rewrite `POST /event/:code/start` in `events.ts`: set event to IN_PROGRESS, set `current_group_id` to first group, fire `runGroup()` async, return 200.

## Phase 6: WebSocket — Action Block Support

- [ ] **6.1 Action confirm handler** — In `ws/handlers.ts`, handle `action_confirm` message type: verify sender is lead, verify block_id matches `current_block_id`, call `advanceAfterBlock()`.
- [ ] **6.2 Control event types** — Add `action_waiting` to `ControlEventPayload` union in redis types. Add to WebSocket subscription handler in `ws/subscriptions.ts`.
- [ ] **6.3 ChatMessagePayload update** — Add optional `block_type` field to `ChatMessagePayload` so the client can render action/map blocks differently.

## Phase 7: Admin API

- [ ] **7.1 Route detail response** — Update `GET /admin/routes/:id` to return groups with nested blocks instead of stops.
- [ ] **7.2 Group CRUD** — Add endpoints: `POST /admin/routes/:id/groups`, `PUT /admin/routes/:id/groups/:groupId`, `DELETE /admin/routes/:id/groups/:groupId`.
- [ ] **7.3 Block CRUD** — Add endpoints: `POST /admin/groups/:groupId/blocks`, `PUT /admin/blocks/:blockId`, `DELETE /admin/blocks/:blockId`.
- [ ] **7.4 Reorder endpoints** — `PUT /admin/routes/:id/groups/reorder` (group positions), `PUT /admin/groups/:groupId/blocks/reorder` (block positions within group).
- [ ] **7.5 Bulk create update** — Update `POST /admin/routes/bulk` to accept groups/blocks structure instead of stops.
- [ ] **7.6 Remove stop endpoints** — Remove old stop CRUD, stop reorder endpoints.

## Phase 8: Admin UI — Route Editor Rewrite

- [ ] **8.1 Route editor structure** — Rewrite `RouteEditorPage.tsx` with group-based layout:
  - Route metadata form (name, city, etc.) at top
  - Ordered list of groups, each collapsible
  - Within each group: ordered list of blocks
  - Drag-to-reorder for both groups and blocks (using existing @dnd-kit)
  - Explicit Save button per group (no autosave)

- [ ] **8.2 Block type picker** — "Add Block" button within each group opens a picker with block types: Message, Image, Question, Action, Map. Each type has a distinct icon.

- [ ] **8.3 Block editors** — Type-specific editor forms:
  - Message: textarea for content, template var reference banner
  - Image: image URL input (or upload via existing S3 presigned URL flow)
  - Question: clue textarea, accepted answers list, hints (sequence editor per hint — reuse sequence item pattern)
  - Action: label input
  - Map: Google Maps URL input
  - All blocks: delay_ms input with preset buttons

- [ ] **8.4 Group management** — Add group, remove group, reorder groups. Each group has a name field.

- [ ] **8.5 Remove old stop editor** — Remove all stop-specific form code, `StopForm` type, stop helper functions.

## Phase 9: Player App — New Block Renderers

- [ ] **9.1 Action block rendering** — When `action_waiting` control event arrives, show a button bubble in the chat. Only the lead sees an interactive button; others see "Waiting for [lead name]...". On press, send `action_confirm` WebSocket message.

- [ ] **9.2 Map block rendering** — When a message with `block_type: 'map'` arrives, render as a styled map link card (icon + "View on Google Maps" link) instead of plain text.

- [ ] **9.3 Linkify** — Already done in previous iteration. URLs in all message bubbles are clickable.

## Phase 10: Testing & Cleanup

- [ ] **10.1 Update test fixtures** — Update all test helpers and fixtures to use groups/blocks instead of stops.
- [ ] **10.2 Pipeline tests** — Update orchestrator, answer-attempt, hint-request, game-completion tests for block-based flow.
- [ ] **10.3 Admin API tests** — Update admin route tests for group/block CRUD.
- [ ] **10.4 Remove dead code** — Remove stops table references, old stop CRUD code, opening sequence code. Clean up imports.
- [ ] **10.5 Update LLM authoring docs** — Update `docs/llm-authoring/` to reflect new groups/blocks data model and API format.

---

## Learnings

- **ESM imports**: All `.ts` files under `packages/shared/src/types/` must use `.js` extensions in import paths (e.g. `'./sequence.js'`). This is the established convention and required for Node ESM resolution.
- **Validation consistency**: Existing Zod schemas use `.trim().min(1)` for required string fields. New schemas must follow the same pattern.
- **Redundant discriminants**: When an entity has both a top-level `type` field and a `config` with its own `type` discriminant, the Zod schema must enforce they match (via `.refine()`) or derive one from the other.
- **URL field validation**: Existing URL fields (e.g. `stopSchema.google_maps_link`) don't use `.trim()` before `.url()`. New URL fields should follow the same pattern for consistency, but this is a codebase-wide improvement candidate.
- **Max length limits**: Most string fields in existing schemas (city, name, clue) lack max length constraints. Only `refund_note` and `routeGroupSchema.name` have them. Future phases should consider adding max lengths consistently across all user-input string fields.

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
