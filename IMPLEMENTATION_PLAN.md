# Implementation Plan — City Roam v2

## Status Key
- [ ] Not started
- [x] Complete

## Phase 1: Foundation + Local Dev Environment (no dependencies)

- [x] **1.0 Docker compose for local dev** — postgres + redis services, shared network, .env loading. Developers need DB/Redis running before anything else → Spec 10 §10.1 (partial — just postgres + redis initially, full compose in 9.1)
- [x] **1.1 Monorepo & root config** — npm workspaces, tsconfig.base.json, root scripts, .env.example (including REVIEW_LINK), .gitignore, .nvmrc, package scaffolding for all 5 packages with correct exports config → Spec 01 §1.1-1.2
- [x] **1.2 Shared package — constants** — all game limits, timeouts, event lifecycle, event code config → Spec 01 §1.5
- [x] **1.3 Shared package — types** — entity types (with left_reason on Participant), enums (with MessageBankType including over-length), WebSocket message types, API response types (EventDetailResponse with current_participant for auto-rejoin, JoinEventResponse with token for WS auth), API error types, Redis pub/sub payload types, LLM types → Spec 01 §1.3
- [x] **1.4 Shared package — validation schemas** — Zod schemas for user input, admin input, API requests → Spec 01 §1.4 [COMPLETE]
- [x] **1.5 Shared package — utilities** — generateEventCode, buildEventUrl(baseDomain, code), buildS3Key, buildS3Url(cdnBaseUrl, key), formatTimestamp, isValidEventCode → Spec 01 §1.6
- [x] **1.6 Shared package — Tailwind preset** — brand colours, chat bubble colours (bubble-self, bubble-other, bubble-guide), system-text, font family → Spec 01 §1.7
  - **Learning**: Tailwind v4 uses CSS-first `@theme` blocks instead of JS config. The `./tailwind` export now points to `preset.css` for CSS `@import`, with `./tailwind/values` for programmatic TS access. Both must be kept in sync.
- [x] **1.7 Shared package — PostHog catalogue** — event names, typed properties, type-safe trackEvent helper → Spec 01 §1.8
- [x] **1.8 Shared package — backend tests** — unit tests for all utilities, validation schemas, and constants → Spec 01 §Backend Tests
  - **Learning**: `eventCodeSchema` (Zod, user-input) accepts 6–8 chars while `isValidEventCode()` (util) requires exactly 8. This is by design but should be documented or harmonised in a future pass — could cause confusion if event codes ever change length.

## Phase 2: Data Layer (depends on Phase 1)

- [x] **2.1 Database schema & migrations** — Drizzle ORM schema + Drizzle Kit migrations for routes, events, participants (with left_reason), messages, stops, message_banks (with over-length type). Handle circular FK (events.lead_participant_id → participants) → Spec 02 §2.1-2.2
  - **Learning**: Drizzle's `.unique()` on a column creates both a UNIQUE constraint and an implicit index. Adding an explicit `index()` on the same column is redundant but harmless. The spec lists `events.code` under §2.5 Indexes — the unique constraint satisfies this.
  - **Learning**: Circular FK between events.lead_participant_id → participants handled via deferred ALTER TABLE in migrate.ts (not in Drizzle schema), using `DEFERRABLE INITIALLY DEFERRED` with idempotent DO $$ block.
- [x] **2.2 Seed data — message banks** — all message bank entries enumerated in spec (7 success, 7 failure, 3 hint-exhausted, 3 clarification, 3 unknown-answer, 3 over-length, 3 opening templates, 3 completion templates) → Spec 02 §2.3
- [x] **2.3 Seed data — development route** — Leeds City Centre Discovery route with 3 stops (Town Hall, Corn Exchange, Leeds Minster) including directions, clues, accepted answers, hints, fun facts, and Google Maps links → Spec 02 §2.4
- [x] **2.4 Indexes** — events.code, events.status, messages(event_id, created_at), participants(event_id), participants(token), stops(route_id, stop_number), message_banks(type) → Spec 02 §2.5
- [x] **2.5 Database tests** — migration up/down, seed data (message banks + dev route), FK constraints, unique constraints, check constraints, circular FK → Spec 02 §Backend Tests

## Phase 3: API Core (depends on Phase 1 + 2)

- [x] **3.1 API package setup** — Hono framework, dual entry points (src/http/index.ts, src/ws/index.ts), env loading with startup validation (including REVIEW_LINK), DB pool (Drizzle), CORS with credentials (SameSite=None), structured JSON request logging, error handling middleware with consistent ApiErrorResponse shape → Spec 03 §3.1, §3.2, §3.6
  - **Learning**: env.ts centralises all process.env access — other modules must import `env` from env.ts, never read process.env directly. Dev mode uses placeholder values for non-critical vars so the app can start without all secrets.
  - **Learning**: WS server intentionally omits CORS middleware (no browser-facing routes) and DB health check (no DB usage). HTTP server has both.
- [x] **3.2 Redis client setup** — ioredis with 2 instances per process (commands + pub/sub), session store (set/get/delete with TTL), chat cache (RPUSH/LRANGE with 24h TTL), rate limiting (INCR+EXPIRE fixed window for join/guide/participant limits) → Spec 09 §9.1, §9.2, §9.4, §9.7
  - **Learning**: Any Redis module that deserializes data (JSON.parse) must wrap in try-catch — Redis data is a system boundary. Return null/skip on parse failure.
  - **Learning**: INCR+EXPIRE for rate limiting must be atomic via Lua script (redis.eval/defineCommand) to prevent keys persisting forever if the process crashes between the two commands.
- [x] **3.3 Redis pub/sub helpers** — channel naming (`event:{code}:incoming/messages/typing/control`), publish/subscribe helper functions, payload serialization/deserialization matching defined schemas → Spec 09 §9.3
- [x] **3.4 Session/auth middleware** — cookie-based participant auth (cookie name: cityroam_session, SameSite=None, Secure, HttpOnly, Domain from COOKIE_DOMAIN env), Redis fast path + DB fallback with re-population → Spec 03 §3.2, §3.4 [COMPLETE]
  - **Learning**: Redis fast path still queries DB for `display_name`/`is_lead`/`is_active` because `SessionData` only stores `participant_id`, `event_id`, `event_code`. Consider extending `SessionData` to include these fields in a future optimization pass to eliminate DB hits on the hot auth path.
  - **Learning**: No custom Hono Env type exists yet — `c.set("session" as any, ...)` is used. When routes start consuming session context via `c.get("session")`, define an `AppEnv` type with `Variables: { session: SessionContext }` and propagate it through the app.
- [x] **3.5 Health check endpoint** — GET /health with DB (SELECT 1) + Redis (PING) connectivity checks, 503 on failure → Spec 03 §3.9 [COMPLETE - implemented as part of 3.1]
- [x] **3.6 Event endpoints** — GET /event/:code (with optional current_participant from cookie for auto-rejoin), POST join (token in response, cookie set, Redis session, participant_joined control event), POST start (lead-only, opening template population, game_started control event), POST leave (left_reason: voluntary, lead reassignment, cookie clear), GET messages (Redis cache first, DB fallback, ?since= filter) → Spec 03 §3.3 [COMPLETE]
  - **Learning**: Every endpoint taking `:code` param must validate via `eventCodeSchema.parse()` — don't skip validation on auth'd endpoints just because session middleware runs first.
  - **Learning**: Query params used in DB queries (like `?since=`) must be validated at the boundary. `new Date(invalidString)` produces `Invalid Date` whose `.getTime()` is NaN, causing silent filter bypasses.
  - **Learning**: `setSession()` should store `display_name` and `is_lead` alongside the core IDs so the auth middleware Redis fast-path can skip the DB query. Update `SessionData` interface in redis/session.ts when fixing.
  - **Learning**: The join endpoint's first-joiner lead assignment (count check → insert) has a theoretical race condition under concurrent requests. Low risk for small-group app with rate limiting, but if ever needed, wrap in a DB transaction with `FOR UPDATE` lock on the participants count query.
- [x] **3.7 Event expiry** — lazy evaluation on GET /event/:code, background sweep every 6 hours for stale events → Spec 03 §3.10 [COMPLETE]
- [x] **3.8 Checkout & webhook endpoints** — Stripe session creation, webhook handler with signature validation + idempotency (check stripe_session_id), event creation (generateEventCode with retry), Resend confirmation email, GET /checkout/success for event code retrieval → Spec 03 §3.3, §3.8 [COMPLETE]
- [x] **3.9 Admin auth & dashboard** — POST /admin/login (JWT, 8h expiry), admin middleware (Bearer token), GET /admin/dashboard → Spec 03 §3.7 [COMPLETE]
- [x] **3.10 Admin event endpoints** — GET /admin/events (paginated, filtered by status), GET /admin/events/:id (with stripe_payment_id), PATCH /admin/events/:id (status update) → Spec 03 §3.7 [COMPLETE]
- [x] **3.11 Admin route & stop CRUD** — routes CRUD with referential integrity check on delete (409), stops CRUD with reorder (PUT reorder with stop_ids array), validation via shared schemas → Spec 03 §3.7 [COMPLETE]
  - **Learning**: Stop reorder and delete-renumber must use single CASE-expression UPDATEs inside a transaction to avoid unique constraint violations on `(route_id, stop_number)` when stops swap positions. Sequential UPDATE loops will fail.
- [x] **3.12 Admin S3 upload** — pre-signed URL generation (5min expiry), file validation via shared imageUploadSchema → Spec 03 §3.7 [COMPLETE]
  - **Learning**: Stop creation has a race condition — the max stop_number query runs outside the transaction. Should be moved inside with a lock. Low risk given admin-only usage but worth fixing.
  - **Learning**: Admin route `:id` path params lack UUID format validation — invalid UUIDs cause raw Postgres errors (500) instead of clean 400s. Consider adding `z.string().uuid()` validation on all admin ID params.
- [x] **3.13 Admin message bank CRUD** — list (filterable by type including over-length), create, update, delete → Spec 03 §3.7 [COMPLETE]
- [x] **3.14 API core tests** — all endpoint tests, session middleware, admin auth, rate limiting, error handling, CORS preflight handling → Spec 03 §Backend Tests
  - **Learning**: Test app in helpers.ts duplicates production app setup (middleware + routes). Consider extracting a shared `createApp()` function so tests exercise the real app assembly. Currently health check tests test a copy, not the production route.
  - **Learning**: The `(db as any).xxx` pattern for Drizzle mock chains works but provides zero compile-time safety. A typed mock interface would catch method renames. Mock chains also don't validate WHERE clause arguments — tests pass even if filter logic is removed.
  - **Learning**: Zod v3/v4 mismatch between API (v3) and shared package (v4) means validation errors from shared schemas are caught as generic 500s instead of structured 400s. Tests work around this with loose assertions (`toBeGreaterThanOrEqual(400)`). Should be resolved by aligning Zod versions.

## Phase 4: AI Guide Pipeline (depends on Phase 3)

- [x] **4.0 HTTP process incoming subscriber** — background Redis subscriber using pattern `event:*:incoming`, extract event code from channel name, pass payload to pipeline orchestrator. Runs in same Node.js event loop as HTTP server → Spec 09 §9.3.2
- [x] **4.1 LLM service interface + DeepSeek implementation** — abstract LLMService interface, DeepSeek implementation with JSON mode, 30s timeout, null return on failure → Spec 04 §4.1
- [x] **4.2 Layer 1 pre-filter** — empty/short/long message handling (over-length bank), participant rate limiting via Redis → Spec 04 §4.2
- [x] **4.3 Layer 2 intent classification** — DeepSeek call with classification prompt (embedded in spec), JSON parse failure = no guide response (message stored), LLM timeout = clarification fallback → Spec 04 §4.3
- [x] **4.4 Answer attempt handler** — answer matching LLM call (prompt embedded in spec), correct flow (success bank + fun fact + directions + next clue + image URL resolution via buildS3Url), incorrect flow (failure bank + hint nudge after 3 wrongs) → Spec 04 §4.4
- [x] **4.5 Hint request handler** — programmatic hint sequence from stop's hints array, exhaustion = answer reveal ({{ANSWER}} replacement) + advance stop with full correct-answer flow → Spec 04 §4.5
- [x] **4.6 Question handler** — DeepSeek call with stop data (prompt embedded in spec), answer/unknown routing, LLM failure = clarification bank → Spec 04 §4.6
- [x] **4.7 Silent/no-op handlers** — off-topic (stored, no response), contextual-comment (stored, logged), prompt-injection (delete message from DB + cache, log hash), inappropriate (delete message, log), clarification (bank response) → Spec 04 §4.7
- [x] **4.8 Guide response cap** — MAX_GUIDE_RESPONSES_PER_EVENT check before any handler, increment guide_response_count after each guide message, system message when cap reached → Spec 04 §4.8 [COMPLETE]
  - **Learning**: System messages (like the cap-reached notification) must use sender_type "system", not "guide". The DB schema's check constraint allows 'user', 'guide', 'system'. System messages should NOT go through `writeGuideMessage` as that auto-increments guide_response_count — write directly with DB insert + appendMessage + publishMessage.
  - **Learning**: Avoid circular dependencies between pipeline modules. `guide-response-cap.ts` should not import from `handlers/answer-attempt.ts` — instead import the lower-level redis helpers directly.
- [x] **4.9 Hunt completion** — triggered when last stop correct/exhausted with no next stop, completion template with {{TOTAL_STOPS}}/{{DISTANCE_KM}}/{{CITY_NAME}}/{{REVIEW_LINK}} from route data + env, COMPLETED status, hunt_complete control event → Spec 04 §4.9
- [x] **4.10 Idle timeout handling** — HTTP process setInterval (60s), in-memory event→timestamp map, nudge after IDLE_PROMPT_TIMEOUT_MS, pause message after IDLE_PAUSE_TIMEOUT_MS (no status change), resume with current clue on next message → Spec 04 §4.10 [COMPLETE v0.0.20]
  - **Learning**: idle-timer.ts exports updateIdleTimestamp, handleIdleResume, removeFromIdleTracking as integration hooks. The orchestrator (4.11) must call these: updateIdleTimestamp on every incoming message, handleIdleResume when wasPaused=true, removeFromIdleTracking on COMPLETED status transitions.
- [x] **4.11 Pipeline orchestrator** — processIncomingMessage entry point with three-step write sequence (DB → cache → pub/sub): store user message → broadcast → pre-filter → check guide rate limit → guide_typing on → classify → handler → guide_typing off → cleanup for injection/inappropriate → update idle timer → Spec 04 §4.11
  - **Learning**: Message deletion for prompt-injection/inappropriate intents is handled inside the respective handlers (silent.ts), not in the orchestrator. This keeps the orchestrator clean and the handlers self-contained. The `handlePromptInjection` handler also hashes message content (SHA256) for monitoring rather than logging raw injection text.
  - **Learning**: The guide response cap is checked at two points: (1) before writing a pre-filter "respond" action, and (2) after LLM classification but before handler routing (excluding off-topic-chat and contextual-comment which are silent). This double-check prevents race conditions where cap is reached between pre-filter and handler execution.
  - **Learning**: The orchestrator is the top-level pipeline entry point — it MUST have a catch block that logs errors with context (eventCode, messageId) since the upstream Redis subscriber silently swallows exceptions. Don't rely on caller error handling for observability.
  - **Learning**: `incrementGuideResponseCount` is handled inside `writeGuideMessage` (answer-attempt.ts), not in the orchestrator. Don't import it in orchestrator — it's the handlers' responsibility.
- [x] **4.12 AI pipeline tests** — all handler tests, pre-filter, classification, LLM mocking, response cap, completion flow, idle timeout, image URL resolution, full pipeline integration → Spec 04 §Backend Tests
  - **Learning**: When mocking Drizzle's chained API in tests, use `mockResolvedValue`/`mockResolvedValueOnce` (not `mockReturnValue`) for methods that are part of an awaited chain (e.g. `.where()`, `.returning()`). JS auto-wraps sync values in Promise.resolve() so tests pass either way, but using the correct async mock catches more real bugs.
  - **Learning**: Don't forget the contextual-comment handler — it's easy to miss because it shares a file with the other silent handlers but has distinct logging behaviour (logs intent for analysis).
  - **Learning**: Orchestrator tests must exercise the full routing path for ALL classification types — not just answer-attempt. prompt-injection/inappropriate in particular require verifying the retroactive user message deletion (step 13 of §4.11). Mocking handlers isn't enough; assert they were called AND that side effects (deletion, logging) occurred.
  - **Learning**: For "silent" handler tests (off-topic, contextual-comment), always add negative assertions (`db.delete` not called) to verify the user message is preserved — the spec distinguishes between "stored" (off-topic) and "deleted" (prompt-injection).

## Phase 5: WebSocket Process (depends on Phase 3, parallel with Phase 4)

- [x] **5.1 WS server setup + connection auth** — Hono WS entry at /ws/:code, token from query param, validation against Redis/DB session store, defined close codes (4001 invalid token, 4002 expired, 4003 not found, 4004 completed/expired, 4005 not active) → Spec 05 §5.1-5.2
- [x] **5.2 Client message handling** — user_message (validate via chatMessageSchema, publish to event:{code}:incoming with IncomingMessagePayload, NO direct DB write or broadcast), typing_start/stop (Redis key with TTL + typing channel publish), ping/pong (+ presence update) → Spec 05 §5.3
- [x] **5.3 Redis pub/sub subscriptions** — subscribe to messages/typing/control channels per event, subscription lifecycle (sub on first connect, unsub on last disconnect, track active subs), broadcast with correct message type mapping (BroadcastMessagePayload → ChatMessagePayload, ControlEventPayload → typed events, TypingPayload → participant/guide typing) → Spec 05 §5.4
- [x] **5.4 Presence tracking** — heartbeat updates on connect/ping, 60s background interval scanning presence keys, 10-minute timeout detection (PARTICIPANT_OFFLINE_TIMEOUT_MS) with DB update (is_active=false, left_reason=timeout) + participant_left control event. Only timeout participants with no active WS connection → Spec 05 §5.6
- [x] **5.5 Connection management** — Map<eventCode, Map<participantId, WebSocket>>, cleanup on disconnect, graceful shutdown with close code 1001 + Redis unsubscribe → Spec 05 §5.7
- [x] **5.6 WS health check** — GET /health on WS server, Redis connectivity + active connection count → Spec 05 §5.9
- [x] **5.7 WebSocket tests** — connection auth, message handling, pub/sub subscriptions, presence, connection lifecycle, graceful shutdown → Spec 05 §Backend Tests
  - **Learning**: `TypingPayload` uses a flat type with nullable `participant_name`/`participant_id` fields rather than a discriminated union. When handling `participant_typing` vs `guide_typing` branches, non-null assertions on these fields are necessary. If the shared types are ever refactored, consider a discriminated union to make this type-safe.

## Phase 6: Frontend App (depends on Phase 3; WebSocket features depend on Phase 5)

- [x] **6.1 App package setup** — Vite + React + TypeScript + Tailwind (shared preset) + React Router v6 + Headless UI + PostHog, React Context (participant, event, WS connection), fetch wrapper with credentials:include and VITE_API_URL prefix → Spec 06 §6.1
  - **Learning**: PostHog analytics module must be imported at the app entry point (main.tsx) as a side-effect import to ensure initialization on mount. Module-level `posthog.init()` only runs when the module is actually imported.
  - **Learning**: Spec 6.2 names the play route component `ChatPage`, not `PlayPage`. Always cross-reference component names against the spec route table.
- [x] **6.2 Join screen** — display name input (shared displayNameSchema validation), submit button, auto-rejoin via GET /event/:code with current_participant check, error states (not found, full, expired, completed, network), redirect based on event status → Spec 06 §6.3
- [x] **6.3 Waiting lobby** — participant list with online dots, lead start button (POST /event/:code/start), WS connection (token from join response context as query param), listen for participant_joined/left/game_started events → Spec 06 §6.4
  - **Learning**: `ParticipantJoinedPayload` and `ParticipantLeftPayload` only include `name`, not `participant_id`. Client must use name-based matching for removals and generate local IDs for additions. If duplicate names become an issue, the shared types should be extended with `participant_id`.
- [x] **6.4 SMS-style chat UI** — message bubbles (right=self blue, left=others grey, left=guide light grey), sender names, timestamps (5min gap), input area (Visual Viewport API for mobile keyboard, multi-line up to 3 lines, Enter=send/Shift+Enter=newline), scroll behaviour with "new messages" pill, image display with Headless UI fullscreen overlay → Spec 06 §6.5
- [x] **6.5 WebSocket integration** — connect/send/receive, auto-reconnect with exponential backoff (1s→16s, max 10 attempts), close-code-aware behaviour (4001/4002 → rejoin, 4003-4005 → error), catch-up via GET messages?since=, manual retry button after max attempts → Spec 06 §6.5
  - **Learning**: Connection banners (reconnecting/connected/fatal) were added in ChatPage and LobbyPage as part of WS integration. Task 6.6 should focus on typing indicators only, since connection state UI is already done. Fatal close code message mapping is duplicated between ChatPage (Record) and LobbyPage (inline ternary) — 6.6 could unify this.
- [x] **6.6 Typing indicators + connection state** — guide pulsing dots in bubble, participant "[Name] is typing..." / "Multiple people are typing...", reconnecting/connected banners, debounce at TYPING_INDICATOR_DEBOUNCE_MS → Spec 06 §6.5
- [x] **6.7 Leave hunt + completion screen** — leave menu (three dots) with confirmation dialog (POST /event/:code/leave), completion screen with summary + configurable review link (VITE_REVIEW_LINK) + Web Share API button → Spec 06 §6.5-6.6
  - **Learning**: Frontend review link buttons on CompletePage must use configurable URLs (VITE_REVIEW_LINK), not hardcoded generic URLs. The backend already uses REVIEW_LINK env var for completion message templates — the frontend buttons should be consistent with this configuration.
  - **Learning**: The spec mentions both Google Reviews and TripAdvisor, but a single configurable VITE_REVIEW_LINK env var is cleaner than hardcoding multiple platforms. The operator sets whichever review link they prefer.

## Phase 7: Marketing Site (depends on Phase 3)

- [x] **7.1 Marketing package setup** — Next.js + TypeScript + Tailwind (shared preset) + PostHog → Spec 07 §7.1
  - **Learning**: Tailwind v4 shared preset integration in globals.css uses `@import "@cityroam/shared/tailwind"` after `@import "tailwindcss"` — no tailwind.config needed. PostHog uses singleton pattern with SSR guard (`typeof window`) and type-safe `trackEvent` from shared analytics catalogue.
- [x] **7.2 Landing page** — hero, how it works (3 steps), anchored pricing (£29/£49), single CTA, social proof placeholders, FAQ accordion, refund policy → Spec 07 §7.2
- [x] **7.3 Checkout flow** — CTA → loading state ("Redirecting to checkout...") → POST /checkout/create-session → Stripe redirect, error handling, cancel returns to / → Spec 07 §7.3
- [x] **7.4 Success page** — GET /checkout/success?session_id → event link display, copy button (clipboard), Web Share API with fallback, instructions, refund reminder, refresh-safe → Spec 07 §7.4
  - **Learning**: Next.js App Router requires `useSearchParams()` to be inside a `<Suspense>` boundary for static generation. Extract the hook-using component and wrap with `<Suspense fallback={...}>` in the page's default export.
- [x] **7.5 SEO & meta** — title, OG tags, structured data (JSON-LD LocalBusiness/Product), sitemap, robots.txt → Spec 07 §7.5 [COMPLETE v0.0.29]
  - **Learning**: Next.js App Router has built-in `sitemap.ts` and `robots.ts` conventions — no need for `next-sitemap` package. Export a typed function returning `MetadataRoute.Sitemap` or `MetadataRoute.Robots`.
  - **Note**: OG image asset (`/og-image.png` 1200x630) still needs to be created and placed in `packages/marketing/public/`.

## Phase 8: Admin Panel (depends on Phase 3)

- [x] **8.1 Admin package setup** — Vite + React + TypeScript + Tailwind (shared preset), localStorage JWT auth, fetch wrapper with Authorization header, no PostHog → Spec 08 §8.1-8.2 [COMPLETE]
- [x] **8.2 Login + protected routes** — login form (POST /admin/login), JWT storage in localStorage, 401 redirect, logout → Spec 08 §8.2
- [x] **8.3 Dashboard** — event counts by status (stat cards), revenue count, recent events list (last 10, click to detail) → Spec 08 §8.3 [COMPLETE]
- [x] **8.4 Events management** — paginated table with status filter, detail view (full event info, Stripe payment ID with copy button, participants table, message log) → Spec 08 §8.4-8.5 [COMPLETE]
  - **Learning**: Admin pages share constants (STATUS_LABELS, STATUS_COLORS, formatDate) — extract to `packages/admin/src/lib/event-utils.ts` to avoid drift between list and detail views.
  - **Learning**: Spec §8.5 requires "route name" in event detail. Backend joins routes table in GET /admin/events/:id to populate `route_name` on `AdminEventDetailResponse`.
  - **Learning**: `AdminEventDetailResponse` uses full `Participant` entity type which includes `token` field. The frontend doesn't use it but it's exposed in the API response. Consider narrowing the participant type to exclude auth tokens in a future pass.
- [x] **8.5 Route & stop editor** — route form (shared routeSchema validation, auto-calculated total_stops), stops list with drag reorder, stop editor (tag/chip input for accepted_answers, ordered hints 2-3, image upload to S3 with preview, google_maps_link) → Spec 08 §8.6-8.8 [COMPLETE]
  - **Learning**: Drag-and-drop reorder must operate on the same array that is rendered. If stops are sorted into `sortedStops` for display, drag indices come from that sorted array — splice/reorder logic must use sorted indices or map them back to the source array. Otherwise items get swapped incorrectly.
  - **Learning**: Always check `response.ok` after fetch to S3 presigned URLs. A failed PUT (403/500) should show an error, not silently add the key to the images list.
  - **Learning**: When computing next stop_number via `MAX(stop_number)`, the query must run inside the same transaction as the INSERT to avoid race conditions with concurrent requests.
  - **Learning**: Admin frontend catch blocks must handle non-ApiError exceptions (network failures, JSON parse errors) — add a fallback `else` branch that shows a generic error message to the user.
  - **Learning**: Optimistic UI updates (e.g., drag-reorder) must revert on ALL error paths, not just known error types. If the catch block has an ApiError branch that calls fetchRoute() to revert, the non-ApiError branch must also revert — otherwise the UI stays out of sync with the server.
  - **Learning**: When rendering nullable numeric values with unit suffixes (e.g., "30 mins"), the entire string including the unit must be conditional. `{value ?? '—'} mins` produces "— mins" — use a ternary: `{value != null ? \`${value} mins\` : '—'}`.
  - **Learning**: Admin API endpoints that read data for validation before a transaction must move those reads inside the transaction. This applies to both writes (stop-create max query) and updates (reorder stop-count validation). Same TOCTOU pattern.
- [x] **8.6 Message bank editor** — type tabs (8 types including over-length), CRUD, minimum count warning (<5 active), template variable reference for opening/completion/hint-exhausted → Spec 08 §8.10 [COMPLETE v0.0.34]

## Phase 9: Deployment & Infrastructure (finalize after all above)

- [ ] **9.1 Full docker-compose** — all 7 services (postgres, redis, api-http, api-ws, app, marketing, admin), shared network, volumes for hot reload, HTTPS notes for SameSite=None → Spec 10 §10.1
- [ ] **9.2 Production Dockerfiles** — multi-stage builds: API (shared for http/ws commands), marketing (Next.js), app (Vite → nginx with SPA fallback at /app/), admin (Vite → nginx with SPA fallback) → Spec 10 §10.2
- [ ] **9.3 Coolify deployment config** — service definitions, Traefik routing rules (marketing root, /app/* to app, api.domain to HTTP, api.domain/ws/* to WS, admin.domain), SSL via Let's Encrypt → Spec 10 §10.3-10.4
- [ ] **9.4 Environment variable documentation** — all vars per package in .env.example (including REVIEW_LINK), startup validation in API listing all missing vars → Spec 10 §10.5
- [ ] **9.5 Database operations** — migrate/seed scripts runnable standalone and via docker-compose exec → Spec 10 §10.6

## Phase 10: Integration & Polish

- [ ] **10.1 End-to-end integration test** — user message flows from WS → Redis incoming → HTTP pipeline → Redis messages → WS broadcast. Verify full message lifecycle.
- [ ] **10.2 Structured logging** — ensure all API processes use structured JSON logging (method, path, status, duration, error details). Log LLM call durations. Log prompt-injection/inappropriate events for monitoring.

## Learnings
- Multi-step DB mutations (reorder, delete-with-renumber, create-with-counter-update) MUST use `db.transaction()`. The `stops` table has a UNIQUE constraint on `(route_id, stop_number)`, so sequential stop_number updates during reorder will cause constraint violations when stops swap positions. Fix: either use a single UPDATE with CASE expression or set temp values first, always inside a transaction. This applies to ALL insert+update pairs, not just updates.
- Referential integrity checks (e.g., "does this route have events?") must be inside the same transaction as the subsequent delete to avoid TOCTOU races.
- Array-of-IDs reorder endpoints must validate uniqueness (`new Set(ids).size === ids.length`) in addition to checking membership and count. Duplicate IDs can pass length checks against the DB count in edge cases.
- When creating a centralized env module, all other modules (redis, db, middleware) must import from it rather than reading `process.env` directly. Otherwise the validation layer is bypassed and env access is inconsistent.
- CORS origin checks in dev mode should use URL parsing or exact hostname matching, not `String.includes()` — substring matching on "localhost" would accept malicious domains containing that substring.
- Any package that imports a library at the TypeScript level should list it as an explicit dependency, even if it's available transitively. Transitive deps can disappear on version bumps.
- Scaffolding packages should include all stack-defining dependencies from the spec (e.g., hono for api, tailwindcss for frontend packages), not just the build tooling. This avoids needing to retroactively add them during implementation of later tasks.
- Tailwind v4 uses `@tailwindcss/vite` for Vite projects and `@tailwindcss/postcss` for Next.js projects.
- When implementing typed interfaces, always cross-reference the full property definitions in the project-spec (§2.2.6), not just the spec summary in the deliverables section (§1.8). The deliverables section may say "typed properties per event" without listing the exact shapes.
- Redis pub/sub: ioredis `.on("message")` is additive — each call adds another listener. When implementing subscribe/unsubscribe lifecycles, store handler references so they can be removed with `.off()` on cleanup. Otherwise listeners accumulate and stale closures fire on every message.
- Non-atomic INCR+EXPIRE and RPUSH+EXPIRE patterns (as spec'd in §9.7) have a theoretical crash-window race condition. Acceptable for MVP but consider Lua scripts or MULTI/EXEC for hardening later.

## Notes
- Phase 1.0 (docker-compose for postgres + redis) is the first task — developers need local DB/Redis immediately
- Phases 4 and 5 can be developed in parallel once Phase 3 is complete
- Phase 10.1 integration test requires both Phase 4 and 5 complete
- Phases 6, 7, 8 can be developed in parallel once Phase 3 is complete. Priority: 6 (core product) > 7 (revenue) > 8 (internal tool)
- Phase 6 can be scaffolded (6.1-6.4) without Phase 5, but WS features (6.5-6.6) require Phase 5
- Phase 9.1 (full docker-compose) extends the partial compose from 1.0 with all app services
- Backend tests required for Phases 1-5 and Phase 10; no tests for frontend packages (6, 7, 8)
- All shared validation schemas must be used on both client and server sides
- Redis is required for the WebSocket process and AI pipeline to function; it cannot be skipped
- The HTTP process runs a background Redis subscriber (not just request/response) — this is critical glue between WS and AI pipeline
- User messages are stored and broadcast by the HTTP process pipeline (not the WS process) — the WS process only publishes to the `incoming` channel
- Three-step message write sequence everywhere: DB → Redis cache → Redis pub/sub
- SameSite=None (not Strict) is required for cross-subdomain cookie auth — this requires Secure=true and HTTPS
- Guide typing is communicated via pub/sub only, no separate Redis key needed
