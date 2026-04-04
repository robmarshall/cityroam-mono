# Implementation Plan — Multi-Language (i18n) Support

## Status Key
- [ ] Not started
- [~] In progress
- [x] Complete

---

## Overview

City Roam is currently English-only across all 5 packages. This is a missed market opportunity -- players who speak other languages can't use the product. This plan covers adding multi-language support to the marketing site, player app, API pipeline, and database, enabling routes to be authored and played in any supported language.

---

## Core Design Decision: Language Lives on the Route, Grouped by Family

A route already contains location-specific content (clues, hints, accepted answers). A Spanish route about Leeds is fundamentally **a different route** from the English one. So rather than adding complex multilingual JSONB to block configs, we create separate routes per language and **group them under a shared "route family"**.

### Route Families

A new `route_families` table acts as a lightweight parent that ties together all language variants of the same logical route:

```
route_families
├── id (uuid PK)
├── name (varchar) -- e.g. "Leeds City Centre"
├── city (varchar) -- shared across all variants
├── created_at
└── updated_at

routes
├── ... (existing columns)
├── language (varchar NOT NULL DEFAULT 'en')
└── route_family_id (uuid FK → route_families.id, NOT NULL)
```

**Why a family table?**
- Admin UI can list families, click in, and see all language variants side by side
- Editors can easily cross-reference between languages when authoring
- Shared metadata (city, canonical name) lives on the family; language-specific metadata (name, description, content) stays on the route
- Clean queries: "give me all routes for this family" is a simple FK filter

**Additional schema changes:**
1. Add `language` column to `routes` -- the authoring unit
2. Add `route_family_id` FK to `routes` -- links to parent family
3. Add `language` column to `events` -- set when lead picks language in lobby, used at runtime
4. Add `route_family_id` FK to `events` -- set at purchase time, used to find available variants
5. Add `language` column to `message_banks` -- filtered at query time
6. Move `city` from `routes` to `route_families` (routes inherit it via the family); remove `city` from `routes`

**Type definition:**
```typescript
export type SupportedLanguage = "en" | "es" | "fr" | "de" | "nl";
```

### Stripe & Language Selection Flow

One Stripe product maps to one route family (not an individual route). Language is **not** determined at purchase time or by the marketing site locale. Instead:

1. **Purchase**: Marketing site passes the route family to checkout. Stripe webhook creates an event linked to `route_family_id` and a default `route_id` (English variant). `event.language` defaults to `'en'`.
2. **Lobby**: Before the game starts, the lead sees a language selector showing all available variants for the route family. Selecting a language updates `event.route_id` and `event.language`.
3. **Game start**: Language is locked once the game begins. All pipeline messages, AI prompts, and message bank queries use the event's language from this point.

This means the marketing site never needs to know or care about language — it just sells a route family.

---

## Phase 1: Foundation (Shared + Database Schema)

- [x] **1.1 Shared package types & constants** — Add `SupportedLanguage` type to `packages/shared/src/types/enums.ts`. Add `SUPPORTED_LANGUAGES` and `DEFAULT_LANGUAGE` to `packages/shared/src/constants/index.ts`. Add `RouteFamily` type to `packages/shared/src/types/entities.ts`. Add `language` and `route_family_id` fields to `Route` entity type. Remove `city` from `Route` type. Add `language` and `route_family_id` fields to `Event` entity type. Add `language` field to `MessageBank` entity type. Add `language` and `available_languages` to `EventDetailResponse` and `JoinEventResponse` in `packages/shared/src/types/api.ts`.

- [x] **1.2 New table: `route_families`** — Create `packages/api/src/db/schema/route-families.ts` with columns: `id` (uuid PK), `name` (varchar NOT NULL), `city` (varchar NOT NULL), `created_at`, `updated_at`. Export from schema index.

- [x] **1.3 Alter `routes` table** — Add `language varchar NOT NULL DEFAULT 'en'`. Add `route_family_id uuid` FK → `route_families.id`. Remove `city` from `routes` (it now lives on `route_families`). Migration strategy: create a route_family for each existing route (using its city + name), set the FK, then make FK NOT NULL, then drop `city`.

- [x] **1.4 Alter `events` table** — Add `language varchar NOT NULL DEFAULT 'en'`. Add `route_family_id uuid` FK → `route_families.id`. Migration: set `route_family_id` from each event's `route.route_family_id`, then make NOT NULL.

- [x] **1.5 Alter `message_banks` table** — Add `language varchar NOT NULL DEFAULT 'en'`. Update index to include `(type, language)` for efficient querying.

- [x] **1.6 Seed data & migration** — Create route_families for all existing routes and link them. Tag all existing message bank entries as `language: 'en'`. All existing routes/events default to 'en'.

- [x] **1.7 Fix message bank type validation** — Pre-existing bug: `messageBankTypeSchema` in `admin-input.ts` is missing `"hint-offer"` and `"hint-decline"` types. Admins cannot create these message bank entries through the UI. Fix the validation schema to include all 9 types. This must be fixed before we can create language-specific hint-offer/hint-decline messages.

- [x] **1.8 Player-facing validation messages** — Zod schemas in `user-input.ts` have ~8 hardcoded English error messages (display name too short/long, message too long, etc.). These surface in the player app. Two options: (a) make the app show its own i18n error messages based on error codes rather than the raw Zod messages, or (b) accept that validation errors stay English since they're rare edge cases. Recommend option (a) -- the app already has `friendlyError()` for API errors, extend this pattern to validation errors.
  - **Learnings:** Zod schemas now emit error codes; `errors.ts` in the app maps codes → English. The `validationMessage()` fallback returns the raw code if unmapped, which is safe. Phase 3.4 (i18n error messages) can swap the mapping for i18next keys with no schema changes.

---

## Phase 2: API Pipeline Language Threading [COMPLETE]

- [x] **2.1 Message bank queries** — Update `getRandomMessageBank()` to accept `language` parameter and filter by `(type, language, is_active)`.

- [x] **2.2 Orchestrator language threading** — In `packages/api/src/services/pipeline/orchestrator.ts`: load `event.language` at Step 1, pass it through to all handler contexts. Add `language` field to all handler context interfaces.

- [x] **2.3 Update all handlers** — `answer-attempt.ts`: pass language to `getRandomMessageBank()` and `buildAnswerMatchPrompt()`. `hint-request.ts`: pass language to message bank calls. `hint-nudge.ts`: pass language to message bank calls. `question.ts`: pass language to `buildQuestionPrompt()`. `silent.ts`: pass language where needed. `pre-filter.ts`: pass language to over-length message bank.

- [x] **2.4 AI prompt adaptation** — `classifier.ts`: add `"The player is communicating in ${language}"` to classification prompt; add multilingual examples for hint-request, hint-nudge, etc. `answer-attempt.ts`: add `"The game language is ${language}"` to answer match prompt. `question.ts`: add `"Respond in ${languageName}"` to question prompt.

- [x] **2.5 Deterministic matching** — `deterministic-match.ts`: make article stripping language-aware (en: the/a/an, es: el/la/los/las, fr: le/la/les, etc.). Add Unicode normalization (NFD + strip combining marks) so accented characters match their base forms (e.g., `café` matches `cafe`). Handle language-specific characters like `ñ`, `ß`, `ü`.

- [x] **2.6 Per-language word lists config** — Currently `word-match.ts` has hardcoded English-only `AFFIRMATIVE_WORDS` and `NEGATIVE_WORDS` arrays used for hint offer confirmation in the orchestrator. Replace with a config file (e.g. `packages/api/src/config/word-lists.ts`) that exports a `Record<SupportedLanguage, { affirmative: string[], negative: string[] }>` object. The `isAffirmativeResponse()` and `isNegativeResponse()` functions take a `language` parameter and look up the correct word list from the config. No database or admin UI needed -- just a typed config file that developers edit when adding a new language.

- [x] **2.7 Idle timer messages** — `idle-timer.ts` has 3 hardcoded player-facing messages ("Welcome back...", "It's been a while...", "Still exploring?"). These need to either become new message bank types (`idle-resume`, `idle-pause`, `idle-nudge`) or use per-language fallback maps.

- [x] **2.8 Guide response cap message** — `guide-response-cap.ts` has a hardcoded system message ("The guide has reached its message limit..."). Add as a new message bank type (`guide-cap`) or per-language fallback map.

- [x] **2.9 Event creation & API responses** — `packages/api/src/routes/checkout.ts`: when creating event from Stripe webhook, set `event.route_family_id` from the route family, set `event.route_id` to the default English variant, set `event.language` to `'en'`. `packages/api/src/routes/events.ts`: include `language` and available language variants in `GET /event/:code` response. Add `PUT /event/:code/language` endpoint for lead to change language before game start (updates `route_id` and `language`). Admin event creation endpoint: accept optional `language` or default to `'en'`.

- [x] **2.10 Confirmation email i18n** — The Stripe webhook in `checkout.ts` sends a hardcoded English confirmation email (subject, body, instructions). Create per-language email templates. The email language comes from the event's language (which comes from the route).

- [x] **2.11 Template vars city lookup** — `template-vars.ts` queries `route.city` for the `{{CITY_NAME}}` variable. After moving `city` to `route_families`, update `buildRouteTemplateVars()` to join `route_families` to get the city name.

- [x] **2.12 WebSocket system messages** — Audit all WebSocket payloads for hardcoded English text. `GameStartedPayload`, `GameCompletePayload`, `ErrorPayload`, and system messages sent via `incoming-subscriber.ts` may carry player-facing strings. Move any hardcoded text to message banks or per-language fallback maps.

- [x] **2.13 Checkout flow: Stripe product → route family mapping** — Currently the Stripe webhook picks the first active route. With route families, one Stripe product maps to one route family. The marketing site passes the `route_family_id` to `POST /checkout/create-session`, which stores it in Stripe session metadata. The webhook reads the metadata, finds the English variant of that family as the default, and creates the event linked to both the family and the default route. Language selection happens later in the app lobby — the marketing site locale is irrelevant.

---

## Phase 3: Player App i18n

- [x] **3.1 Setup** — Install `react-i18next` + `i18next` in `packages/app`. Create `packages/app/src/i18n/index.ts` (i18next initialization). Create `packages/app/src/i18n/en.json` (extract all hardcoded strings, ~100 strings). Wrap app with i18n provider in `packages/app/src/main.tsx`.
  - **Learnings:** 3.1 also covered 3.2's string extraction scope — all page components, ErrorBoundary, and errors.ts are already converted. Non-component code (errors.ts, ErrorBoundary class) uses `i18n.t()` directly rather than the `useTranslation()` hook. The `friendlyError()` fallback still returns raw `err.message` for unmapped ApiError codes — Phase 3.4 should address this. The router.tsx Suspense "Loading..." was intentionally left untranslated since i18n may not be initialized when the Suspense fallback renders.

- [x] **3.2 String extraction** — `JoinPage.tsx`: "Join the Team", "Your name", "Enter your display name", all `friendlyError()` messages. `LobbyPage.tsx`: "Waiting for players", "Start the Game", "Lead", "You", status messages. `ChatPage.tsx`: "Type a message...", "Connected", "Reconnecting...", dialog text, "Leave Game", "Change Name". `CompletePage.tsx`: "Game Complete!", share text, "Leave a Google Review", "Done". `ErrorBoundary.tsx`: error fallback text.

- [x] **3.3 Language selection flow** — `GET /event/:code` returns `language` field and `available_languages` list (all active variants in the family). `JoinPage` reads event language, calls `i18next.changeLanguage(event.language)`. In `LobbyPage`, the lead sees a language selector dropdown (populated from `available_languages`). Changing language calls `PUT /event/:code/language`, which updates the event's route and language. All UI renders in the event's language. Language is locked once the game starts — the `PUT` endpoint rejects changes for events not in `WAITING` status. When the lead selects a new language, show a bilingual confirmation dialog — in both the current language and the target language — e.g. "Are you sure you want to change the language to Spanish? You cannot change it once the game has started. / ¿Estás seguro de que quieres cambiar el idioma a español? No podrás cambiarlo una vez que el juego haya comenzado." The selector is hidden in `ChatPage`.

- [x] **3.4 Error message i18n** — The app's `friendlyError()` utility maps API error codes to English strings. Refactor to use i18next translation keys instead of hardcoded strings. Extend to cover Zod validation errors (per Phase 1.8) — the app should display its own translated error messages based on error codes rather than raw Zod messages.
  - **Learnings:** Data-driven ERROR_CODE_KEYS map is cleaner than a switch — easy to extend. `validationMessage()` cascades through validation keys, then error code keys, then generic fallback. Note: `ChatPage.tsx:513` and `LobbyPage.tsx:165,183` still use raw `err.message` for ApiError — these pre-date this task and should be converted to `friendlyError(err)` in a follow-up.

- [x] **3.5 Translation files** — Create `es.json`, `fr.json`, etc. as new languages are needed. Small surface area (~100 strings) makes this manageable.

---

## Phase 4: Marketing Site i18n (Infrastructure Only)

> **Note:** This phase sets up the i18n infrastructure and extracts English strings into translation files. Actual translations into other languages are **not** in scope — they will be authored later as new markets are targeted.

- [x] **4.1 Library setup: `next-intl` v4** — Install `next-intl` in `packages/marketing`. Create `packages/marketing/src/i18n/config.ts` (locales list, default locale). Create `packages/marketing/src/i18n/request.ts` (`getRequestConfig` for next-intl).
  - **Learnings:** next-intl v4 requires a `routing.ts` file using `defineRouting()` in addition to config/request — added as `src/i18n/routing.ts`. Also bundled 4.6 (next.config.ts plugin) here since the library won't initialize without it. The `en.json` messages file is created empty — 4.3 handles extraction.

- [x] **4.2 Locale-prefixed routing** — Create `packages/marketing/src/middleware.ts` (locale detection from `Accept-Language` header, redirect bare paths to `/en/...`). Move all pages under `src/app/[locale]/`: layout.tsx, page.tsx, families/page.tsx, hen-parties/page.tsx, team-building/page.tsx, checkout/success/page.tsx.
  - **Learnings:** next-intl middleware handles bare-path redirects (e.g. `/families` → `/en/families`), so existing `next/link` with bare `href` values still work. However, they always redirect to the default locale, not the user's current locale. Task 4.5 must update Header.tsx (and checkout success "Back to Home" link) to use `createNavigation(routing)` from next-intl for locale-aware linking. Also: old empty directories (e.g. `src/app/team-building/`) should be cleaned up.

- [x] **4.3 English extraction** — Create `packages/marketing/messages/en.json` (extract all ~8,000 words of hardcoded content). Structure by page: `home.*`, `families.*`, `henParties.*`, `teamBuilding.*`, `common.*`, `metadata.*`. Replace hardcoded strings in all pages with `useTranslations()` / `getTranslations()` calls. No other language files yet — those are created when translations are authored. [COMPLETE — 4b5e2d7]
  - **Learnings:** Structured en.json with 10 namespaces (metadata, common, cta, faq, chatDemo, home, families, henParties, teamBuilding, checkout) and 310 keys. Server components use `getTranslations()` from `next-intl/server`, client components use `useTranslations()` from `next-intl`. Static `metadata` exports must be converted to async `generateMetadata()` functions to use translations. Bold text in translations uses `<b>` tags rendered via `t.rich()`. Array-like content (FAQ items, features) uses numeric string keys ("0", "1", etc.) with hardcoded `Array.from({ length: N })` iteration.

- [x] **4.4 SEO** — `layout.tsx`: dynamic `<html lang={locale}>`, locale-aware `generateMetadata`, translated JSON-LD. Add `<link rel="alternate" hrefLang>` tags via next-intl. `sitemap.ts`: generate entries for all locale/page combinations. Each page's `generateMetadata` uses translated title/description. [COMPLETE — 111037e]

- [x] **4.5 UI updates** — Add language switcher to `Header.tsx` (dropdown or flag icons). Update `CTAButton.tsx` (translated button label and loading/error text). Update `FAQ.tsx` (FAQ items from translation files). Update `ChatDemo.tsx` (demo messages from translation files). [COMPLETE — 30136fe]

- [x] **4.6 next.config.ts** — Add `next-intl` plugin configuration. [COMPLETE — done in 4.1]

---

## Phase 5: Admin Updates

- [ ] **5.1 Route families UI (new)** — Routes list page now shows **route families** instead of individual routes. Each family card shows: family name, city, and language badges (e.g. "EN", "ES", "FR") for each variant that exists. Clicking a family opens a **family detail page** showing all language variants side by side. "Create Route Family" button to create the parent entity (name + city). Within a family: "Add Language Variant" button to create a new route in a specific language. Editors can easily cross-reference between languages when authoring content.

- [ ] **5.2 Route editor updates** — Route editor stays largely the same but now includes a read-only language badge. The route's family context is visible (breadcrumb: Family Name > English / Spanish / etc.). Language is set at route creation time (when adding a variant) and is immutable after.

- [ ] **5.3 Message banks management** — Add language filter/tab to message banks page. Add language field to message bank create/edit form.

- [ ] **5.4 Admin panel stays English** — No i18n for the admin UI itself (internal users only, low ROI).

---

## Phase 6: LLM Translation Workflow

The existing LLM authoring pipeline (`docs/llm-authoring/`) needs a new translation workflow. The use case: an English route is complete, and you want to create a Spanish (or other language) variant in the same family.

- [ ] **6.1 New doc: `docs/llm-authoring/translation-guide.md`** — Instructions for the LLM to translate an existing route into a new language.

  **Workflow:**
  1. Read the source route (English) via `GET /admin/routes/:id` (includes all groups and blocks)
  2. Check if a variant already exists in the target language for this family
  3. Create the new route via `POST /admin/routes/bulk-groups` with same `route_family_id`, target `language`, translated content, same structure

  **Block translation rules:**
  - `message` blocks: Translate `content` text. Keep template variables (`{{CITY_NAME}}`, etc.) as-is.
  - `image` blocks: Reuse same `image_url` (images are language-agnostic unless they contain text overlays).
  - `map` blocks: Reuse same Google Maps URL (Maps URLs are location-based, display in user's device language automatically).
  - `question` blocks: Translate `clue`, `accepted_answers`, all `hints` sequences. Keep same structure and count.
  - `action` blocks: Translate the `label` text.
  - `delay_ms`: Keep the same timing values.

  **What NOT to change:** Google Maps URLs, image URLs (unless containing English text), template variable names, block ordering/group structure, delay timings.

- [ ] **6.2 Update existing authoring docs** — `api-reference.md`: document new `language` and `route_family_id` fields. `data-model.md`: document route families and language field. `content-guide.md`: add "Translation" section with tone/style guidance per language.

- [ ] **6.3 API endpoint for translation reference** — Ensure `GET /admin/routes/:id` returns complete route data. Consider adding `GET /admin/route-families/:id/routes` endpoint for cross-referencing all variants.

---

## Phase 7: Content Authoring (Ongoing)

- [ ] **7.1 Message bank seed script** — There are 9 message bank types, each needing multiple entries per language. Create a seed script (or LLM-assisted bulk creation endpoint) to generate initial message bank entries for a new language. Manual entry via admin UI is impractical at scale.
- [ ] **7.2 Author routes** — Create routes in new languages using the LLM translation workflow or admin editor.
- [ ] **7.3 Validate translations** — Play through each translated route end-to-end in the target language to verify AI responses, message bank entries, and UI strings are all correct.

---

## Verification Plan

1. **Database**: Run migrations, verify columns exist with correct defaults, check existing data tagged 'en'
2. **API**: Create a test event with `language: 'es'`, verify message bank queries filter correctly, verify AI prompts include language context
3. **Player App**: Join a Spanish-language event, verify UI renders in Spanish, verify chat messages from AI pipeline come back in Spanish
4. **Marketing Site**: Visit `/es/`, verify translated content renders, verify locale switcher works, verify SEO metadata is locale-specific
5. **Admin**: Create a route family, add Spanish variant, create Spanish message bank entries, verify they appear correctly filtered
6. **LLM Translation**: Use the LLM authoring workflow to translate an English route to Spanish, verify all blocks translated correctly
7. **End-to-end**: Purchase a Spanish route via marketing site, receive event code, play through in Spanish, verify entire flow

---

## Learnings

- **Mock DB setup pattern**: When adding a new schema table (e.g. `routeFamilies`), ALL test files with mock DB `query` objects need the new table added — even if current tests don't exercise that path. Files to update: `admin.test.ts`, `handlers.test.ts`, `completion-cap-idle.test.ts`, `integration.test.ts`.
- **Drizzle migration for moving columns**: When moving a column from one table to a new parent table (e.g. `city` from `routes` to `route_families`), the migration pattern is: (1) create parent table, (2) INSERT data from child, (3) add nullable FK on child, (4) UPDATE child FK from parent match, (5) make FK NOT NULL, (6) DROP old column. Use `DISTINCT` in the INSERT to avoid duplicates.
- **Zod `z.string().uuid()` rejects empty strings**: When a form field may be empty, use `z.preprocess()` to convert `""` to `undefined` before the UUID validator.

---

## Key Files Reference

| Area | Critical Files |
|------|---------------|
| Schema | `packages/api/src/db/schema/route-families.ts` (new), `routes.ts`, `events.ts`, `message-banks.ts` |
| Types | `packages/shared/src/types/enums.ts`, `entities.ts`, `api.ts` |
| Pipeline | `packages/api/src/services/pipeline/orchestrator.ts`, `classifier.ts`, `idle-timer.ts`, `guide-response-cap.ts` |
| AI Prompts | `packages/api/src/services/pipeline/handlers/answer-attempt.ts`, `question.ts` |
| Matching | `packages/api/src/services/pipeline/deterministic-match.ts`, `word-match.ts` |
| Checkout/Email | `packages/api/src/routes/checkout.ts` |
| Events API | `packages/api/src/routes/events.ts` |
| WebSocket | `packages/api/src/services/pipeline/incoming-subscriber.ts` |
| Template Vars | `packages/api/src/services/template-vars.ts` |
| Validation | `packages/shared/src/validation/user-input.ts`, `admin-input.ts` |
| Player App | `packages/app/src/pages/JoinPage.tsx`, `ChatPage.tsx`, `LobbyPage.tsx`, `CompletePage.tsx` |
| Marketing | `packages/marketing/src/app/layout.tsx`, `page.tsx`, `next.config.ts` |
| Admin | `packages/admin/src/pages/RouteEditorPage.tsx`, `MessageBanksPage.tsx` |
| LLM Authoring | `docs/llm-authoring/translation-guide.md` (new), `api-reference.md`, `data-model.md`, `content-guide.md` |

---

## Learnings

### From Task 1.1 (Shared types & constants)
- **Bridge pattern**: When updating shared types before DB schema, API routes need temporary hardcoded values (`'en' as any`) to satisfy TypeScript. These must use `as any` since the DB column doesn't exist yet. Track all instances for cleanup in the DB migration tasks (1.2-1.5).
- **Test data lag**: Tests that exercise API endpoints need both the old field (for DB writes) and new fields (for response assertions) during the transition period. Remove old fields once DB migrations land.
- **RouteEditorPage form**: Still uses `city` internally since the DB column persists. The form interface (`RouteForm`) is internal to the page, not the shared `Route` type. Full form migration should happen in task 5.2 after DB schema changes.
- **Pre-existing issues to fix in 1.7**: `messageBankTypeSchema` in `admin-input.ts` is missing `hint-offer` and `hint-decline` types (confirmed during review).
- **`as any` casts**: 12 instances across admin.ts and events.ts need cleanup when DB columns are added. Consider a helper function to map DB rows to response types to centralize this.

### From Phase 2 Review
- **Fallback string pattern**: When adding per-language support, ALL fallback strings for user-facing messages must use per-language fallback maps (like `COMPLETION_FALLBACK`, `HINT_OFFER_FALLBACK`). Don't leave English-only `?? "some string"` — create a `Record<string, string>` with all 5 languages and fall back with `MAP[language] ?? MAP.en`.
- **Language threading completeness**: Every code path that can reach a user-facing message needs `language`. `runGroup` was missed because it's an entry point separate from the orchestrator pipeline. Audit all entry points, not just the main pipeline path.
- **WS error pattern**: When replacing English error strings with error codes, put the code in the `code` field and either omit `message` (let client map) or put a generic human-readable string in `message`. Don't put the code as the message.
- **Zod validation errors**: When Zod safeParse fails and the issue message is already an error code (from custom error maps), that code should be sent as the WS `code` field, not wrapped in a generic "VALIDATION_ERROR" code. Otherwise the client can't look up the specific error.
- **Type consistency for fallback maps**: All per-language fallback maps should use `Record<SupportedLanguage, string>` (not `Record<string, string>`) to get compile-time enforcement that all languages are covered.
- **Constant deduplication**: Shared constants like `LANGUAGE_NAMES` that appear in multiple pipeline files should live in a single shared location. Three copies is the threshold to extract.

### From Phase 3.1 Review
- **Don't forget aria-labels**: When extracting hardcoded strings for i18n, remember to include `aria-label` attributes — they are user-facing (screen readers) and must be translated. Grep for `aria-label="` to catch them.
- **i18n outside React components**: For utility files like `errors.ts` and class components like `ErrorBoundary`, import `i18next` directly and use `i18n.t()` rather than the `useTranslation()` hook. This avoids circular dependencies since `i18n/index.ts` doesn't import from `lib/` or `components/`.

### From Phase 3.3 Review
- **Preserve all fields in setEvent replacements**: `SET_EVENT` replaces the entire event object (not a merge). Every `setEvent()` call must include all fields, especially newly added optional fields like `language`. Use `eventRef.current?.language` to carry forward.
- **Use specific enum types in WS payloads**: All payload interfaces should use specific enum types (e.g., `SupportedLanguage`) instead of `string` for type safety — consistent with `SenderType`, `ParticipantLeftReason`, etc.

### From Phase 4.4 Review
- **Hreflang consistency**: When adding `alternates.languages` to page-level `generateMetadata()`, ensure ALL pages get the treatment — including the home page. Easy to miss because the layout also declares alternates, but page-level alternates are needed for correct per-URL hreflang signals.
- **JSON-LD script safety**: Always escape `<` in `JSON.stringify` output used in `dangerouslySetInnerHTML` (`JSON.stringify(jsonLd).replace(/</g, "\\u003c")`) to prevent `</script>` breakout. Low risk with developer-controlled strings but a defense-in-depth best practice.

### From Phase 5.1 Review
- **Error catch consistency**: Admin pages must handle both `ApiError` and generic errors in catch blocks. Pattern: `if (err instanceof ApiError && err.status !== 401) { setError(...) } else if (!(err instanceof ApiError)) { setError("Failed to ...") }`. Missing the non-ApiError branch causes silent failures on network errors.
- **Use `<Link>` for clickable cards**: Clickable card elements should use React Router `<Link>` instead of `<div onClick>` for keyboard accessibility and screen reader semantics. This matches the pattern in EventDetailPage.
- **Derive language lists from shared constants**: Don't hardcode `SUPPORTED_LANGUAGES` arrays in UI components. Import from `@cityroam/shared` so new languages are automatically available everywhere.
- **Modal styling consistency**: Admin modals should use `mx-4 w-full` on the inner container, `font-semibold` on headings, and `gap-2` on button rows. Reference MessageBanksPage/EventDetailPage modals as the canonical pattern.
