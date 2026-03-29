# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 12.4 Remove "hunt" from analytics event names — rename PostHog events in `packages/shared/src/analytics/index.ts`: `HUNT_JOINED` → `GAME_JOINED`, `HUNT_STARTED` → `GAME_STARTED`, `HUNT_COMPLETED` → `GAME_COMPLETED`, `HUNT_ABANDONED` → `GAME_ABANDONED`. Update all call sites and typed property interfaces.
- **Spec File**: N/A
- **Stage**: commit
- **Started**: 2026-03-29T00:01:00Z
- **Last Heartbeat**: 2026-03-29T12:00:00Z
- **Inner Loop Count**: 2

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Complete

## TODOs (feed back to implement)

## Files Modified
- packages/shared/src/analytics/index.ts (modified)
- packages/app/src/pages/JoinPage.tsx (modified)
- packages/app/src/pages/LobbyPage.tsx (modified)
- packages/app/src/pages/CompletePage.tsx (modified)
- packages/app/src/pages/ChatPage.tsx (modified)

## Iteration Log
- Loop 1: Starting implementation
- Loop 2: Renamed all 4 HUNT_* constants to GAME_* in shared analytics, updated string values (hunt_* → game_*), updated typed property interface keys, and updated all 4 call sites in app pages. TypeScript compiles clean, grep confirms no remaining HUNT_ references.
- Loop 2 (test): Tests passed (257/257), typecheck passed. Advancing to review.
- Loop 2 (review): Review passed. All 4 HUNT_* → GAME_* renames correct in analytics and all call sites. No stale references in source code. WebSocket types (HuntCompletePayload, "hunt_complete") are out of scope — separate from PostHog events.

## Blockers
(none)
