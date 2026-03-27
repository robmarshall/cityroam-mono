# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 3.11 Admin route & stop CRUD — routes CRUD with referential integrity check on delete (409), stops CRUD with reorder (PUT reorder with stop_ids array), validation via shared schemas → Spec 03 §3.7
- **Spec File**: specs/03-api.md
- **Stage**: commit
- **Started**: 2026-03-27T00:01:00.000Z
- **Last Heartbeat**: 2026-03-27T16:12:00.000Z
- **Inner Loop Count**: 5

## Stage Status
- [x] implement - Complete
- [x] test - Passed (77/77 tests, typecheck clean)
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Review: Reorder endpoint — replaced sequential UPDATE loop with single CASE-expression UPDATE inside db.transaction() to avoid unique constraint violations on (route_id, stop_number).
- [x] Review: Delete-stop — wrapped delete + renumber + total_stops update in db.transaction(), also used CASE expression for renumbering.
- [x] Review: Delete-route — wrapped stops delete + route delete in db.transaction().
- [x] Review: Replaced raw sql`IN` with inArray() for consistency at line 129.
- [x] Review: Create-stop (admin.ts ~line 478-502) — insert + total_stops update are not wrapped in a transaction. If process crashes between insert and update, total_stops will be stale. Wrap both in db.transaction() like delete-stop already does.
- [x] Review: Reorder endpoint (admin.ts ~line 546) — no duplicate check on stop_ids array. Input like [A, A, B] for a 3-stop route passes length check but corrupts ordering. Add: `if (new Set(stop_ids).size !== stop_ids.length) return c.json({ error: "Duplicate stop IDs" }, 400)`
- [x] Review: Route delete referential integrity check (admin.ts ~line 437-450) — event count check is outside the delete transaction, creating a TOCTOU race. Move the check inside the transaction.

## Files Modified
- packages/api/src/routes/admin.ts (modified)
- packages/shared/src/validation/admin-input.ts (modified)
- packages/shared/src/validation/index.ts (modified)
- packages/shared/src/types/api.ts (modified)
- packages/shared/src/types/index.ts (modified)

## Iteration Log
- Loop 1: Implemented admin route & stop CRUD endpoints. Added routes CRUD (list with stop counts, create, detail with stops, update, delete with 409 referential integrity check). Added stops CRUD (create with auto-numbering, update, delete with renumbering). Added stop reorder endpoint with validation. Added stopReorderSchema, AdminRouteListResponse, AdminStopReorderResponse types. TypeScript compiles clean.
- Loop 1 test: Build passed, 77/77 tests passed, typecheck passed. Advancing to review.
- Loop 1 review: Review found issues — (1) CRITICAL: reorder endpoint will hit unique constraint violation on (route_id, stop_number) during sequential updates when stops swap positions; (2) delete-stop and delete-route multi-step mutations need transaction wrapping; (3) inconsistent SQL pattern (raw sql vs inArray). Looping back to implement.
- Loop 2: Fixed all 4 review issues. Reorder now uses single CASE-expression UPDATE in a transaction. Delete-stop uses transaction with CASE-expression renumbering. Delete-route uses transaction. Replaced raw sql IN with inArray(). TypeScript compiles clean.
- Loop 2 test: Build passed, 77/77 tests passed, typecheck passed. Advancing to review.
- Loop 2 review: Review found issues — (1) create-stop insert+update not in transaction; (2) reorder missing duplicate stop_ids check; (3) route delete referential integrity check outside transaction (TOCTOU). Looping back to implement.
- Loop 3: Fixed all 3 review issues. Create-stop now wraps insert+total_stops update in db.transaction(). Reorder validates duplicate stop_ids with Set check. Route delete moves referential integrity check inside the transaction. TypeScript compiles clean.
- Loop 3 test: Build passed, 77/77 tests passed, typecheck passed. Advancing to review.
- Loop 3 review: Review passed — all prior issues resolved, spec fully satisfied, no new security or quality issues.

## Blockers
(none)
