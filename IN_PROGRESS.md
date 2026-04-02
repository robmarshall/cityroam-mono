# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 3.4 Error message i18n — The app's `friendlyError()` utility maps API error codes to English strings. Refactor to use i18next translation keys instead of hardcoded strings. Extend to cover Zod validation errors (per Phase 1.8) — the app should display its own translated error messages based on error codes rather than raw Zod messages.
- **Spec File**: N/A
- **Stage**: commit
- **Started**: 2026-04-02T00:00:00.000Z
- **Last Heartbeat**: 2026-04-02T12:00:00.000Z
- **Inner Loop Count**: 2

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Complete

## TODOs (feed back to implement)

## Files Modified
- packages/app/src/lib/errors.ts (modified)
- packages/app/src/i18n/en.json (modified)

## Iteration Log
- Loop 1: Starting implementation
- Loop 2: Refactored friendlyError() to use a data-driven ERROR_CODE_KEYS map instead of a switch statement, eliminating raw err.message fallback — all paths now go through i18n.t(). Added RATE_LIMITED and UNAUTHORIZED error codes. Extended validationMessage() to fall back through ERROR_CODE_KEYS before returning a generic translated error (instead of raw code string). Added rateLimited and unauthorized translation keys to en.json. Type-check passes.
- Loop 3 (test): Build passed (API + shared typecheck clean). All 337 tests passed (201 API, 136 shared). Typecheck passed. Advancing to review.
- Loop 4 (review): Review passed. Code is clean — data-driven map, all paths through i18n.t(), proper fallback cascade, no security issues, no over-engineering. Noted pre-existing err.message usages in ChatPage/LobbyPage for future cleanup.

## Blockers
(none)
