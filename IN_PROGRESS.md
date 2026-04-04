# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 4.2 Locale-prefixed routing — Create `packages/marketing/src/middleware.ts` (locale detection from `Accept-Language` header, redirect bare paths to `/en/...`). Move all pages under `src/app/[locale]/`: layout.tsx, page.tsx, families/page.tsx, hen-parties/page.tsx, team-building/page.tsx, checkout/success/page.tsx.
- **Spec File**: N/A
- **Stage**: commit
- **Started**: 2026-04-02T00:01:00Z
- **Last Heartbeat**: 2026-04-04T00:03:00Z
- **Inner Loop Count**: 2

## Stage Status
- [x] implement - Complete
- [x] test - Passed (337 tests, typecheck clean)
- [x] review - Passed

## TODOs (feed back to implement)

## Files Modified
- `packages/marketing/src/middleware.ts` (new)
- `packages/marketing/src/app/[locale]/layout.tsx` (new)
- `packages/marketing/src/app/[locale]/page.tsx` (moved from src/app/page.tsx)
- `packages/marketing/src/app/[locale]/families/page.tsx` (moved from src/app/families/page.tsx)
- `packages/marketing/src/app/[locale]/hen-parties/page.tsx` (moved from src/app/hen-parties/page.tsx)
- `packages/marketing/src/app/[locale]/team-building/page.tsx` (moved from src/app/team-building/page.tsx)
- `packages/marketing/src/app/[locale]/checkout/success/page.tsx` (moved from src/app/checkout/success/page.tsx)
- `packages/marketing/src/app/layout.tsx` (deleted)

## Iteration Log
- Loop 1: Starting implementation of locale-prefixed routing for marketing site
- Loop 2: Implemented middleware with next-intl createMiddleware (locale detection from Accept-Language, redirects bare paths). Moved all 5 page files under [locale] segment. Created new [locale]/layout.tsx with NextIntlClientProvider wrapping, dynamic html lang attribute, and locale validation via hasLocale(). Deleted old root layout.tsx. TypeScript compiles cleanly. Build fails on pre-existing lightningcss native module issue (unrelated).
- Loop 3 (test): All 337 tests passed (201 API, 136 shared), typecheck clean. Build failures are pre-existing lightningcss native module issue (environment-level, not code-related).
- Loop 4 (review): Review passed. No security issues, no code quality issues. Middleware follows next-intl v4 patterns correctly. Layout migration preserves all functionality. Noted: Header.tsx nav links and checkout success "Back to Home" use bare paths (work via middleware redirect but not locale-aware) — planned fix in task 4.5.

## Blockers
(none)
