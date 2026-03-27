# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 3.6 Event endpoints — GET /event/:code (with optional current_participant from cookie for auto-rejoin), POST join (token in response, cookie set, Redis session, participant_joined control event), POST start (lead-only, opening template population, game_started control event), POST leave (left_reason: voluntary, lead reassignment, cookie clear), GET messages (Redis cache first, DB fallback, ?since= filter) → Spec 03 §3.3
- **Spec File**: specs/03-api-core.md
- **Stage**: commit
- **Started**: 2026-03-27T00:01:00Z
- **Last Heartbeat**: 2026-03-27T00:52:00Z
- **Inner Loop Count**: 3

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Complete

## TODOs (feed back to implement)
- [x] Review: packages/api/src/routes/events.ts:242 - Missing `eventCodeSchema.parse()` validation on POST /start `:code` param (security: unvalidated input reaches DB query)
- [x] Review: packages/api/src/routes/events.ts:392 - Missing `eventCodeSchema.parse()` validation on POST /leave `:code` param (same issue)
- [x] Review: packages/api/src/routes/events.ts:490 - `since` query param not validated as a valid ISO date before use in `new Date(since)` and DB query; invalid input causes silent NaN comparisons
- [x] Review: packages/api/src/routes/events.ts:188-192 - `setSession()` only stores participant_id/event_id/event_code but not display_name/is_lead; forces every auth'd request through DB fallback. Extend SessionData and store these fields at join time.

## Files Modified
- packages/api/src/routes/events.ts (new)
- packages/api/src/http/index.ts (modified)
- packages/api/src/redis/session.ts (modified)
- packages/api/src/middleware/session.ts (modified)

## Iteration Log
- Loop 1: Starting implementation of event endpoints
- Loop 2: Implemented all 5 event endpoints (GET /event/:code, POST join, POST start, POST leave, GET messages). Created routes/events.ts with full implementations including lazy expiry, rate limiting, session management, opening template population, lead reassignment, and Redis cache with DB fallback for messages. Mounted routes in http/index.ts. TypeScript compiles cleanly.
- Loop 3 (test): Build passed, all 77 tests passed, typecheck passed. Advancing to review.
- Loop 4 (review): Review found issues — missing input validation on /start and /leave code params, unvalidated `since` query param, incomplete Redis session data (missing display_name/is_lead). Looping back to implement.
- Loop 5 (implement): Fixed all 4 review TODOs: (1) Added eventCodeSchema.parse() to POST /start, (2) Added eventCodeSchema.parse() to POST /leave, (3) Added ISO date validation for `since` query param, (4) Extended SessionData to include display_name/is_lead, updated setSession calls in events.ts join handler and session.ts DB fallback, simplified resolveSession Redis fast path to use cached fields directly. TypeScript compiles cleanly.
- Loop 6 (test): Build passed, all 77 tests passed, typecheck passed. Advancing to review.
- Loop 7 (review): Review passed. All 4 previous TODOs verified fixed. No new blocking issues. Race condition in join lead-assignment noted as low risk (small groups + rate limiting). Background expiry sweep is separate task 3.7.

## Blockers
(none)
