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
- [ ] **3.10 Admin event endpoints** — GET /admin/events (paginated, filtered by status), GET /admin/events/:id (with stripe_payment_id), PATCH /admin/events/:id (status update) → Spec 03 §3.7
- [ ] **3.11 Admin route & stop CRUD** — routes CRUD with referential integrity check on delete (409), stops CRUD with reorder (PUT reorder with stop_ids array), validation via shared schemas → Spec 03 §3.7
- [ ] **3.12 Admin S3 upload** — pre-signed URL generation (5min expiry), file validation via shared imageUploadSchema → Spec 03 §3.7
- [ ] **3.13 Admin message bank CRUD** — list (filterable by type including over-length), create, update, delete → Spec 03 §3.7
- [ ] **3.14 API core tests** — all endpoint tests, session middleware, admin auth, rate limiting, error handling, CORS preflight handling → Spec 03 §Backend Tests

## Phase 4: AI Guide Pipeline (depends on Phase 3)

- [ ] **4.0 HTTP process incoming subscriber** — background Redis subscriber using pattern `event:*:incoming`, extract event code from channel name, pass payload to pipeline orchestrator. Runs in same Node.js event loop as HTTP server → Spec 09 §9.3.2
- [ ] **4.1 LLM service interface + DeepSeek implementation** — abstract LLMService interface, DeepSeek implementation with JSON mode, 30s timeout, null return on failure → Spec 04 §4.1
- [ ] **4.2 Layer 1 pre-filter** — empty/short/long message handling (over-length bank), participant rate limiting via Redis → Spec 04 §4.2
- [ ] **4.3 Layer 2 intent classification** — DeepSeek call with classification prompt (embedded in spec), JSON parse failure = no guide response (message stored), LLM timeout = clarification fallback → Spec 04 §4.3
- [ ] **4.4 Answer attempt handler** — answer matching LLM call (prompt embedded in spec), correct flow (success bank + fun fact + directions + next clue + image URL resolution via buildS3Url), incorrect flow (failure bank + hint nudge after 3 wrongs) → Spec 04 §4.4
- [ ] **4.5 Hint request handler** — programmatic hint sequence from stop's hints array, exhaustion = answer reveal ({{ANSWER}} replacement) + advance stop with full correct-answer flow → Spec 04 §4.5
- [ ] **4.6 Question handler** — DeepSeek call with stop data (prompt embedded in spec), answer/unknown routing, LLM failure = clarification bank → Spec 04 §4.6
- [ ] **4.7 Silent/no-op handlers** — off-topic (stored, no response), contextual-comment (stored, logged), prompt-injection (delete message from DB + cache, log hash), inappropriate (delete message, log), clarification (bank response) → Spec 04 §4.7
- [ ] **4.8 Guide response cap** — MAX_GUIDE_RESPONSES_PER_EVENT check before any handler, increment guide_response_count after each guide message, system message when cap reached → Spec 04 §4.8
- [ ] **4.9 Hunt completion** — triggered when last stop correct/exhausted with no next stop, completion template with {{TOTAL_STOPS}}/{{DISTANCE_KM}}/{{CITY_NAME}}/{{REVIEW_LINK}} from route data + env, COMPLETED status, hunt_complete control event → Spec 04 §4.9
- [ ] **4.10 Idle timeout handling** — HTTP process setInterval (60s), in-memory event→timestamp map, nudge after IDLE_PROMPT_TIMEOUT_MS, pause message after IDLE_PAUSE_TIMEOUT_MS (no status change), resume with current clue on next message → Spec 04 §4.10
- [ ] **4.11 Pipeline orchestrator** — processIncomingMessage entry point with three-step write sequence (DB → cache → pub/sub): store user message → broadcast → pre-filter → check guide rate limit → guide_typing on → classify → handler → guide_typing off → cleanup for injection/inappropriate → update idle timer → Spec 04 §4.11
- [ ] **4.12 AI pipeline tests** — all handler tests, pre-filter, classification, LLM mocking, response cap, completion flow, idle timeout, image URL resolution, full pipeline integration → Spec 04 §Backend Tests

## Phase 5: WebSocket Process (depends on Phase 3, parallel with Phase 4)

- [ ] **5.1 WS server setup + connection auth** — Hono WS entry at /ws/:code, token from query param, validation against Redis/DB session store, defined close codes (4001 invalid token, 4002 expired, 4003 not found, 4004 completed/expired, 4005 not active) → Spec 05 §5.1-5.2
- [ ] **5.2 Client message handling** — user_message (validate via chatMessageSchema, publish to event:{code}:incoming with IncomingMessagePayload, NO direct DB write or broadcast), typing_start/stop (Redis key with TTL + typing channel publish), ping/pong (+ presence update) → Spec 05 §5.3
- [ ] **5.3 Redis pub/sub subscriptions** — subscribe to messages/typing/control channels per event, subscription lifecycle (sub on first connect, unsub on last disconnect, track active subs), broadcast with correct message type mapping (BroadcastMessagePayload → ChatMessagePayload, ControlEventPayload → typed events, TypingPayload → participant/guide typing) → Spec 05 §5.4
- [ ] **5.4 Presence tracking** — heartbeat updates on connect/ping, 60s background interval scanning presence keys, 10-minute timeout detection (PARTICIPANT_OFFLINE_TIMEOUT_MS) with DB update (is_active=false, left_reason=timeout) + participant_left control event. Only timeout participants with no active WS connection → Spec 05 §5.6
- [ ] **5.5 Connection management** — Map<eventCode, Map<participantId, WebSocket>>, cleanup on disconnect, graceful shutdown with close code 1001 + Redis unsubscribe → Spec 05 §5.7
- [ ] **5.6 WS health check** — GET /health on WS server, Redis connectivity + active connection count → Spec 05 §5.9
- [ ] **5.7 WebSocket tests** — connection auth, message handling, pub/sub subscriptions, presence, connection lifecycle, graceful shutdown → Spec 05 §Backend Tests

## Phase 6: Frontend App (depends on Phase 3; WebSocket features depend on Phase 5)

- [ ] **6.1 App package setup** — Vite + React + TypeScript + Tailwind (shared preset) + React Router v6 + Headless UI + PostHog, React Context (participant, event, WS connection), fetch wrapper with credentials:include and VITE_API_URL prefix → Spec 06 §6.1
- [ ] **6.2 Join screen** — display name input (shared displayNameSchema validation), submit button, auto-rejoin via GET /event/:code with current_participant check, error states (not found, full, expired, completed, network), redirect based on event status → Spec 06 §6.3
- [ ] **6.3 Waiting lobby** — participant list with online dots, lead start button (POST /event/:code/start), WS connection (token from join response context as query param), listen for participant_joined/left/game_started events → Spec 06 §6.4
- [ ] **6.4 SMS-style chat UI** — message bubbles (right=self blue, left=others grey, left=guide light grey), sender names, timestamps (5min gap), input area (Visual Viewport API for mobile keyboard, multi-line up to 3 lines, Enter=send/Shift+Enter=newline), scroll behaviour with "new messages" pill, image display with Headless UI fullscreen overlay → Spec 06 §6.5
- [ ] **6.5 WebSocket integration** — connect/send/receive, auto-reconnect with exponential backoff (1s→16s, max 10 attempts), close-code-aware behaviour (4001/4002 → rejoin, 4003-4005 → error), catch-up via GET messages?since=, manual retry button after max attempts → Spec 06 §6.5
- [ ] **6.6 Typing indicators + connection state** — guide pulsing dots in bubble, participant "[Name] is typing..." / "Multiple people are typing...", reconnecting/connected banners, debounce at TYPING_INDICATOR_DEBOUNCE_MS → Spec 06 §6.5
- [ ] **6.7 Leave hunt + completion screen** — leave menu (three dots) with confirmation dialog (POST /event/:code/leave), completion screen with summary + Google/TripAdvisor review links + Web Share API button → Spec 06 §6.5-6.6

## Phase 7: Marketing Site (depends on Phase 3)

- [ ] **7.1 Marketing package setup** — Next.js + TypeScript + Tailwind (shared preset) + PostHog → Spec 07 §7.1
- [ ] **7.2 Landing page** — hero, how it works (3 steps), anchored pricing (£29/£49), single CTA, social proof placeholders, FAQ accordion, refund policy → Spec 07 §7.2
- [ ] **7.3 Checkout flow** — CTA → loading state ("Redirecting to checkout...") → POST /checkout/create-session → Stripe redirect, error handling, cancel returns to / → Spec 07 §7.3
- [ ] **7.4 Success page** — GET /checkout/success?session_id → event link display, copy button (clipboard), Web Share API with fallback, instructions, refund reminder, refresh-safe → Spec 07 §7.4
- [ ] **7.5 SEO & meta** — title, OG tags, structured data (JSON-LD LocalBusiness/Product), sitemap, robots.txt → Spec 07 §7.5

## Phase 8: Admin Panel (depends on Phase 3)

- [ ] **8.1 Admin package setup** — Vite + React + TypeScript + Tailwind (shared preset), localStorage JWT auth, fetch wrapper with Authorization header, no PostHog → Spec 08 §8.1-8.2
- [ ] **8.2 Login + protected routes** — login form (POST /admin/login), JWT storage in localStorage, 401 redirect, logout → Spec 08 §8.2
- [ ] **8.3 Dashboard** — event counts by status (stat cards), revenue count, recent events list (last 10, click to detail) → Spec 08 §8.3
- [ ] **8.4 Events management** — paginated table with status filter, detail view (full event info, Stripe payment ID with copy button, participants table, message log) → Spec 08 §8.4-8.5
- [ ] **8.5 Route & stop editor** — route form (shared routeSchema validation, auto-calculated total_stops), stops list with drag reorder, stop editor (tag/chip input for accepted_answers, ordered hints 2-3, image upload to S3 with preview, google_maps_link) → Spec 08 §8.6-8.8
- [ ] **8.6 Message bank editor** — type tabs (8 types including over-length), CRUD, minimum count warning (<5 active), template variable reference for opening/completion/hint-exhausted → Spec 08 §8.10

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
