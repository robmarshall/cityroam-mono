# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 1.2 New table: `route_families`, 1.3 Alter `routes` table, 1.4 Alter `events` table, 1.5 Alter `message_banks` table, 1.6 Seed data & migration, 1.7 Fix message bank type validation
- **Spec File**: IMPLEMENTATION_PLAN.md (Phase 1)
- **Stage**: commit
- **Started**: 2026-04-02T00:00:00Z
- **Last Heartbeat**: 2026-04-02T13:13:48Z
- **Inner Loop Count**: 8

## Stage Status
- [x] implement - Complete (iteration 1, fixes in iterations 3, 5 & 8)
- [x] test - Passed (337 tests, typecheck clean)
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Fix: tests/admin.test.ts — Route POST/PUT/bulk-groups tests send payloads missing new required fields (`language`, `route_family_id`). Update test fixtures to include these fields so validation passes (currently returning 400).
- [x] Fix: tests/pipeline/handlers.test.ts, completion-cap-idle.test.ts, integration.test.ts — Mock DB object doesn't include `routeFamilies` in `db.query`. Add `routeFamilies` with a `findFirst` mock returning `{ city: "Test City" }` so `buildRouteTemplateVars` (template-vars.ts:38) and `handleQuestion` (question.ts:111) can resolve the city from route families.
- [x] Fix: admin.test.ts:472 — POST /admin/routes returns 500. Added prior `mockReturnValueOnce` for the family insert before the route insert mock.
- [x] Fix: admin.test.ts:920-923 — POST /admin/routes/bulk-groups same issue. Added 4th `mockReturnValueOnce` at the start for the family insert (family → route → group → block).
- [x] Fix: completion-cap-idle.test.ts:99-103 — Added `routeFamilies.findFirst` mock returning `{ city: "Portland" }` in beforeEach. Updated route mock to include `route_family_id` and drop `city`.
- [x] Review: handlers.test.ts:143 — `makeMockRoute()` still has `city: "Melbourne"` but `city` was removed from routes (now on route_families). Remove the stale field and add `route_family_id` for consistency with other test files.

## Files Modified
- packages/api/src/db/schema/route-families.ts (new)
- packages/api/src/db/schema/routes.ts (modified)
- packages/api/src/db/schema/events.ts (modified)
- packages/api/src/db/schema/message-banks.ts (modified)
- packages/api/src/db/schema/index.ts (modified)
- packages/api/src/db/seed.ts (modified)
- packages/api/drizzle/0007_add_route_families_and_language.sql (new)
- packages/api/drizzle/meta/0007_snapshot.json (new)
- packages/api/drizzle/meta/_journal.json (modified)
- packages/api/src/routes/admin.ts (modified)
- packages/api/src/routes/events.ts (modified)
- packages/api/src/routes/checkout.ts (modified)
- packages/api/src/services/template-vars.ts (modified)
- packages/api/src/services/pipeline/handlers/question.ts (modified)
- packages/shared/src/validation/admin-input.ts (modified)
- packages/api/src/__tests__/admin.test.ts (modified)
- packages/api/src/__tests__/pipeline/handlers.test.ts (modified)
- packages/api/src/__tests__/pipeline/completion-cap-idle.test.ts (modified)
- packages/api/src/__tests__/pipeline/integration.test.ts (modified)

## Iteration Log
- Loop 1: Implemented DB schema changes for i18n support:
  - Created `route_families` table schema and migration
  - Added `language` and `route_family_id` columns to routes, events, message_banks
  - Removed `city` from routes (moved to route_families)
  - Updated migration with data migration logic (creates families from existing routes)
  - Updated all API endpoints to use new schema (admin CRUD, checkout, events)
  - Updated template-vars and question handler to join route_families for city
  - Fixed messageBankSchema to include missing hint-offer/hint-decline types (task 1.7)
  - Cleaned up all `as any` casts from task 1.1
  - All packages type-check successfully

- Loop 2 (test): 10 test failures in 2 categories:
  1. Admin route tests (4): missing `language`/`route_family_id` in test fixtures → 400 validation errors
  2. Pipeline tests (6): mock DB missing `routeFamilies` query → TypeError at template-vars.ts:38 and question.ts:111
  Typecheck passes. Looping back to implement.

- Loop 3 (implement fix): Fixed both TODO categories:
  1. Admin validation: `route_family_id` in routeSchema used `z.string().uuid().optional()` which rejected empty strings. Added `z.preprocess()` to convert empty strings to undefined. Test fixtures already had `language`/`route_family_id` fields — the issue was the empty string `""` failing uuid validation.
  2. Pipeline mocks: Added `routeFamilies: { findFirst: vi.fn() }` to db.query mocks in all 3 pipeline test files + admin test. Added `routeFamilies` to schema mocks in integration.test.ts and completion-cap-idle.test.ts. Updated integration test's route mock to use `route_family_id` instead of `city`, added separate `routeFamilies.findFirst` mock returning `{ city: "Leeds" }`.

- Loop 4 (test): 3 test failures remaining. Typecheck passes. Details:
  1. admin.test.ts POST /admin/routes (line 475): 500 error — `.returning()` mock order wrong.
  2. admin.test.ts POST /admin/routes/bulk-groups (line 951): Same `.returning()` ordering issue.
  3. completion-cap-idle.test.ts (line 149): City empty — `routeFamilies.findFirst` mock not configured.

- Loop 5 (implement fix): Fixed all 3 remaining test issues:
  1. admin.test.ts POST /admin/routes: Added `mockReturnValueOnce` for family insert before route insert.
  2. admin.test.ts bulk-groups: Added 4th `mockReturnValueOnce` for family insert (family → route → group → block).
  3. completion-cap-idle.test.ts: Added `routeFamilies.findFirst` mock returning `{ city: "Portland" }`, updated route mock to use `route_family_id` instead of `city`.

- Loop 6 (test): All 337 tests passed (201 API, 136 shared), typecheck passed. Advancing to review.

- Loop 7 (review): Found 1 issue — handlers.test.ts:143 `makeMockRoute()` has stale `city` field from old schema. Looping back to implement for fix.

- Loop 8 (implement fix): Fixed handlers.test.ts:143 — replaced `city: "Melbourne"` with `route_family_id: "family-1"` in `makeMockRoute()` to match new schema.

- Loop 9 (test): All 337 tests passed (201 API, 136 shared), typecheck passed. Advancing to review.

- Loop 10 (review): Review passed. No blocking issues. Minor notes: (1) migration INSERT could use DISTINCT ON (name, city) to handle hypothetical duplicate routes, but acceptable for real data; (2) handlers.test.ts and integration.test.ts missing routeGroups in mock DB query, but no tests exercise that path. Advancing to commit.

## Blockers
(none)
