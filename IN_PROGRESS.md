# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: Phase 5: Game Engine — Pipeline Updates (5.1–5.5)
- **Spec File**: N/A
- **Stage**: commit
- **Started**: 2026-04-01T00:00:00.000Z
- **Last Heartbeat**: 2026-04-01T15:05:00.000Z
- **Inner Loop Count**: 9

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Fix: events.test.ts start test rewritten for new group-based handler flow (added runGroup mock, rewrote test to use chainable where + limit mocks, updated assertions for group runner call)

## Files Modified
- packages/api/src/services/pipeline/orchestrator.ts (modified)
- packages/api/src/services/pipeline/handlers/answer-attempt.ts (modified)
- packages/api/src/services/pipeline/handlers/hint-request.ts (modified)
- packages/api/src/services/pipeline/handlers/question.ts (modified)
- packages/api/src/services/pipeline/handlers/game-completion.ts (modified)
- packages/api/src/routes/events.ts (modified)
- packages/api/src/__tests__/pipeline/handlers.test.ts (modified)
- packages/api/src/__tests__/pipeline/orchestrator.test.ts (modified)
- packages/api/src/__tests__/pipeline/integration.test.ts (modified)
- packages/api/src/__tests__/events.test.ts (modified)

## Iteration Log
- Loop 1: Starting implementation of Phase 5 — Game Engine Pipeline Updates
- Loop 2: Completed all 5 sub-tasks:
  - 5.1: Updated orchestrator to load current question block via `current_block_id` instead of stops. Extracts clue and accepted_answers from QuestionBlockConfig.
  - 5.2: Rewrote answer-attempt handler to load question block config. On correct answer, resets counters and calls `advanceAfterBlock()` instead of manually sending fun fact/directions/next clue.
  - 5.3: Rewrote hint-request handler to load hints from question block config (`SequenceItem[][]`). Uses `sendSequence()` for multi-message hints. On exhaustion, calls `advanceAfterBlock()`.
  - 5.4: Updated game-completion to use `applyTemplateVars` + `buildRouteTemplateVars` instead of inline `.replace()` chains.
  - 5.5: Rewrote event start handler to load first route group and call `runGroup()` async instead of loading stops/messageBanks for opening message. Sets `current_group_id` on event.
  - Also updated question.ts handler to load block data instead of stop data for LLM context.
  - Production code compiles cleanly (0 non-test TS errors). Test files need updating per Phase 10.

- Loop 3 (test): Build failed — 3 TS errors in handlers.test.ts (context shape mismatches after Phase 5 refactor). Looping back to implement.

- Loop 4: Fixed 3 TS errors in handlers.test.ts — replaced `routeId` with `currentBlockId: null` in `makeAnswerCtx` and `makeHintCtx`, added `currentBlockId: null` to `makeQuestionCtx`. Build passes cleanly.

- Loop 5 (test): 14/26 tests failed. All failures from Phase 5 refactor: tests still use stop-based mocks/assertions but handlers now use block-based architecture (currentBlockId, QuestionBlockConfig, advanceAfterBlock, sendSequence). Looping back to implement with detailed TODOs.

- Loop 6: Rewrote all three test files to use block-based architecture:
  - orchestrator.test.ts: Added `current_block_id`/`current_group_id` to event row, added `routeBlocks` to DB mock query/schema, fixed handler assertion to expect `currentBlockId` instead of `routeId`, added `routeBlocks.findFirst` mock for orchestrator Step 8.
  - handlers.test.ts: Added mocks for group-runner (advanceAfterBlock), send-sequence (sendSequence), template-vars (buildRouteTemplateVars). Replaced `makeMockStop` with `makeMockQuestionBlock`. Updated all 3 context helpers to default `currentBlockId: "block-1"`. Rewrote 6 answer-attempt tests, 2 hint-request tests, 3 question tests to use routeBlocks.findFirst mocks and assert on advanceAfterBlock/sendSequence calls. Removed old S3 image test (images are now separate blocks handled by group-runner).
  - integration.test.ts: Added `routeBlocks` to DB mock query/schema. Added mocks for group-runner, send-sequence, template-vars. Added `current_block_id`/`current_group_id` to event row. Replaced all `stops.findFirst` mocks with `routeBlocks.findFirst`. Updated correct-answer assertions to check advanceAfterBlock instead of stop advancement. Updated hint-request assertions to check sendSequence. Updated question handler to use block mocks.
  - Build compiles cleanly (0 TS errors).

- Loop 7 (test): 3/190 tests failed in events.test.ts. Root cause: the "inserts opening message with template variables populated" start test (line 466) is still written for the old handler flow (opening templates, stops, routes) but the handler now loads routeGroups and calls runGroup. The leave tests (lines 570, 624) fail only due to cascading mock corruption from the start test — they pass in isolation. Typecheck passes. Looping back to implement.

- Loop 8: Fixed events.test.ts start test — added `vi.mock("../services/group-runner.js")`, imported `runGroup`, rewrote test to mock chainable `where` + `limit` for routeGroups select chain, removed old stop/route/messageBanks/template mocks, updated assertions to check `set()` with `current_group_id`/`current_block_id`, `publishControl` with `game_started`, and `runGroup` call. Build compiles cleanly.

- Loop 9 (test): All 190 API tests passed, 77 shared tests passed, typecheck passed. Advancing to review.
- Loop 10 (review): Review passed. No bugs introduced by Phase 5. Pre-existing patterns (race conditions, missing error handling) noted but not in scope. Added learnings to IMPLEMENTATION_PLAN.md. Advancing to commit.

## Blockers
(none)
