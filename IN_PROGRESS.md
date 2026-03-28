# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 10.2 Structured logging — ensure all API processes use structured JSON logging (method, path, status, duration, error details). Log LLM call durations. Log prompt-injection/inappropriate events for monitoring.
- **Spec File**: N/A (Phase 10 polish task)
- **Stage**: commit
- **Started**: 2026-03-28T00:00:00Z
- **Last Heartbeat**: 2026-03-28T23:50:00Z
- **Inner Loop Count**: 9

## Stage Status
- [x] implement - Complete
- [x] test - Passed (257 tests, typecheck clean)
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Fix: packages/api/src/__tests__/event-expiry.test.ts:70 - Test expects old plain-text log `"[expiry-sweep] marked 1 event(s) as EXPIRED"` but structured logging now outputs JSON `{"component":"expiry-sweep","message":"expired events","count":1}`. Update assertion to match new structured JSON format.
- [x] Fix: packages/api/src/__tests__/pipeline/handlers.test.ts:584 - Test expects `console.log` called with string containing `"[contextual-comment]"` but structured logging now outputs JSON with `"component":"pipeline","message":"contextual-comment"`. Update assertion to match new structured JSON format.
- [x] Fix: packages/api/src/__tests__/events.test.ts - 7 tests fail due to event code case normalization changes in shared package. Updated all test fixtures and assertions to use lowercase event codes ("abcd2345") consistently, matching the eventCodeSchema .toLowerCase() transform.
- [x] Review: packages/api/src/routes/checkout.ts:145 - PII exposure: new structured log explicitly includes `email: buyerEmail` which the old code did not log. Remove the email field from the log call to avoid PII in logs.

## Files Modified
- packages/api/src/lib/logger.ts (new)
- packages/api/src/middleware/logger.ts (modified)
- packages/api/src/middleware/error-handler.ts (modified)
- packages/api/src/services/llm/deepseek.ts (modified)
- packages/api/src/services/pipeline/orchestrator.ts (modified)
- packages/api/src/services/pipeline/classifier.ts (modified)
- packages/api/src/services/pipeline/handlers/silent.ts (modified)
- packages/api/src/services/pipeline/handlers/answer-attempt.ts (modified)
- packages/api/src/services/pipeline/handlers/question.ts (modified)
- packages/api/src/services/pipeline/handlers/hint-request.ts (modified)
- packages/api/src/services/pipeline/handlers/hunt-completion.ts (modified)
- packages/api/src/services/event-expiry.ts (modified)
- packages/api/src/services/pipeline/idle-timer.ts (modified)
- packages/api/src/services/pipeline/incoming-subscriber.ts (modified)
- packages/api/src/redis/client.ts (modified)
- packages/api/src/routes/checkout.ts (modified)
- packages/api/src/http/index.ts (modified)
- packages/api/src/ws/index.ts (modified)
- packages/api/src/ws/presence.ts (modified)
- packages/api/src/__tests__/event-expiry.test.ts (modified)
- packages/api/src/__tests__/pipeline/handlers.test.ts (modified)
- packages/api/src/__tests__/events.test.ts (modified)

## Iteration Log
- Loop 1: Starting implementation
- Loop 2: Created centralized structured logger (lib/logger.ts) with createLogger(component) factory. Updated all 18 files across the API to use structured JSON logging. Added LLM call duration tracking in deepseek.ts. All prompt-injection/inappropriate events now log structured JSON with eventCode and messageId. TypeScript compiles cleanly.
- Loop 3 (test): Build passed. Typecheck passed. 2 tests failed — event-expiry.test.ts and handlers.test.ts assert old plain-text log format but structured logging now outputs JSON. Looping back to implement.
- Loop 4: Fixed test assertions in event-expiry.test.ts (lines 70-72, 83-85) and handlers.test.ts (line 584) to match new structured JSON log format instead of old plain-text `[component]` format.
- Loop 5 (test): Build fails (pre-existing @cityroam/shared module resolution — not related to this task). Shared typecheck passes. API tests: 173 passed, 7 failed in events.test.ts. Failures caused by event code case normalization changes (shared package EVENT_CODE_ALPHABET changed to lowercase + eventCodeSchema .toLowerCase() transform) — test fixtures still use uppercase codes. Looping back to implement.
- Loop 6: Fixed events.test.ts — replaced all 30 occurrences of uppercase "ABCD2345" with lowercase "abcd2345" to match the eventCodeSchema normalization.
- Loop 7 (test): Build passed (API+shared). All 257 tests passed (180 API, 77 shared). Typecheck passed. Advancing to review. This fixes session/code mismatches causing 403s and assertion failures.
- Loop 8 (review): Review found 1 issue — checkout.ts:145 logs buyer email (PII) in structured log that old code did not include. Looping back to implement.
- Loop 9: Removed `email: buyerEmail` from the structured log call in checkout.ts:145 to fix PII exposure. Advancing to test.
- Loop 10 (test): Build passed (API+shared). All 257 tests passed (180 API, 77 shared). Typecheck passed. Advancing to review.
- Loop 11 (review): Review passed. No new security issues introduced — participantName was already logged in old format, checkout email PII fix confirmed, stack traces in server logs acceptable. Advancing to commit.

## Blockers
(none)
