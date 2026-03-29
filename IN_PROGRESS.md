# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 12.5 Remove "hunt" from shared types and API internals — rename `HuntCompletePayload` → `GameCompletePayload` in `packages/shared/src/types/websocket.ts`, update the `hunt_complete` Redis pub/sub message type in `packages/shared/src/types/redis.ts`, update re-exports in `packages/shared/src/types/index.ts`, update all API and app imports. Rename `hunt_complete` WebSocket message case in ChatPage. Update seed data message bank copy ("Welcome to the hunt" → "Welcome to the game", etc.), email templates ("treasure hunt is booked" → "experience is booked"), checkout route copy.
- **Spec File**: N/A
- **Stage**: commit
- **Started**: 2026-03-29T00:00:00.000Z
- **Last Heartbeat**: 2026-03-29T00:16:00.000Z
- **Inner Loop Count**: 1

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Complete

## TODOs (feed back to implement)

## Files Modified
- packages/shared/src/types/websocket.ts (modified) — HuntCompletePayload → GameCompletePayload
- packages/shared/src/types/index.ts (modified) — re-export renamed
- packages/shared/src/types/redis.ts (modified) — hunt_complete → game_complete in ControlEventPayload
- packages/api/src/services/pipeline/handlers/game-completion.ts (new) — renamed from hunt-completion.ts
- packages/api/src/services/pipeline/handlers/hunt-completion.ts (deleted) — replaced by game-completion.ts
- packages/api/src/services/pipeline/handlers/answer-attempt.ts (modified) — import + call + prompt updated
- packages/api/src/services/pipeline/handlers/hint-request.ts (modified) — import + call updated
- packages/api/src/services/pipeline/classifier.ts (modified) — LLM prompt updated
- packages/api/src/services/pipeline/handlers/question.ts (modified) — LLM prompt updated
- packages/api/src/services/pipeline/idle-timer.ts (modified) — pause message updated
- packages/api/src/services/pipeline/orchestrator.ts (modified) — comment updated
- packages/api/src/ws/subscriptions.ts (modified) — import + case block renamed
- packages/api/src/db/seed.ts (modified) — opening template + route description updated
- packages/api/src/routes/checkout.ts (modified) — email subject + heading updated
- packages/app/src/pages/ChatPage.tsx (modified) — import + case block renamed
- packages/admin/src/pages/EventDetailPage.tsx (modified) — "Hunt Progress" → "Game Progress"
- packages/api/src/__tests__/pipeline/handlers.test.ts (modified) — mock/import/assertions renamed
- packages/api/src/__tests__/pipeline/completion-cap-idle.test.ts (modified) — import/describe/assertions renamed

## Iteration Log
- Loop 1: Renamed all hunt references across shared types, API pipeline, WS subscriptions, seed data, email templates, app ChatPage, admin EventDetailPage, and test files. TypeScript compilation verified clean across all 4 packages.
- Loop 1 (test): All 257 tests passed (180 API, 77 shared), typecheck passed. Advancing to review.
- Loop 1 (review): Review passed — rename complete and correct across all files, no stale hunt references in source, no issues introduced by this change.

## Blockers
(none)
