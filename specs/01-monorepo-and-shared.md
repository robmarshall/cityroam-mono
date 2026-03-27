# Spec 01: Monorepo Setup & Shared Package

## Goal
Establish the npm workspace monorepo structure and the shared TypeScript package that all other packages depend on.

## Deliverables

### 1.1 Monorepo Root
- Root `package.json` with npm workspaces pointing to `packages/*`
- Root `tsconfig.base.json` that all packages extend
- Root scripts: `dev` (concurrent), `dev:marketing`, `dev:app`, `dev:api`, `dev:admin`, `build`
- `.gitignore`, `.nvmrc` (Node 20 LTS), `.env.example`
- `Dockerfile` updates if needed for dev environment

### 1.2 Package Scaffolding (empty shells)
Create skeleton `package.json` + `tsconfig.json` for each package:
- `packages/shared` — TypeScript only, no build target. Package name: `@cityroam/shared`
- `packages/api` — Hono on Node.js. Package name: `@cityroam/api`
- `packages/app` — Vite + React + Tailwind. Package name: `@cityroam/app`
- `packages/marketing` — Next.js + Tailwind. Package name: `@cityroam/marketing`
- `packages/admin` — Vite + React + Tailwind. Package name: `@cityroam/admin`

#### Module Exports
The shared package's `package.json` must define explicit `exports` so consumers import specific modules:
```
"exports": {
  "./types": "./src/types/index.ts",
  "./validation": "./src/validation/index.ts",
  "./constants": "./src/constants/index.ts",
  "./utils": "./src/utils/index.ts",
  "./tailwind": "./src/tailwind/preset.ts",
  "./analytics": "./src/analytics/index.ts"
}
```
Each sub-module has a barrel `index.ts` re-exporting all public items.

### 1.3 Shared Package — Types (`packages/shared/src/types/`)

**File: `entities.ts`** — Core domain objects:

- `Event` — id, code, status, route_id, buyer_email, current_stop, hints_given, wrong_attempts, guide_response_count, created_at, started_at, completed_at, expires_at, lead_participant_id, stripe_session_id, stripe_payment_id
- `Participant` — id, event_id, display_name, token, is_lead, is_active, joined_at, last_seen_at, left_at, left_reason (nullable, uses `ParticipantLeftReason`)
- `Message` — id, event_id, step_number, sender_type, sender_name, participant_id, content, image_url, created_at
- `Route` — id, city, name, description, total_stops, estimated_duration_mins, estimated_distance_km, is_active, created_at, updated_at
- `Stop` — id, route_id, stop_number, name, directions_from_previous, clue, accepted_answers (string[]), hints (string[]), correct_response, fun_fact, images (string[]), google_maps_link, created_at, updated_at
- `MessageBank` — id, type, content, is_active, created_at, updated_at

**File: `enums.ts`**:
- `EventStatus` — `NOT_STARTED | WAITING | IN_PROGRESS | COMPLETED | EXPIRED`
- `SenderType` — `user | guide | system`
- `ParticipantLeftReason` — `voluntary | timeout`
- `MessageBankType` — `success | failure | hint-exhausted | clarification | unknown-answer | opening | completion | over-length`

**File: `websocket.ts`** — WebSocket message types:

Client -> Server:
- `UserMessagePayload` — `{ text: string }`
- `TypingStartPayload` — `{}`
- `TypingStopPayload` — `{}`
- `PingPayload` — `{}`

Server -> Client:
- `ChatMessagePayload` — `{ id: string, sender_type: SenderType, sender_name: string, participant_id: string | null, content: string, image_url: string | null, step_number: number, created_at: string }`
- `GuideTypingPayload` — `{ is_typing: boolean }`
- `ParticipantTypingPayload` — `{ name: string, is_typing: boolean }`
- `ParticipantJoinedPayload` — `{ name: string, participant_count: number }`
- `ParticipantLeftPayload` — `{ name: string, participant_count: number, reason: ParticipantLeftReason }`
- `GameStartedPayload` — `{ started_by: string }`
- `HuntCompletePayload` — `{ summary: string }`
- `PongPayload` — `{}`
- `ErrorPayload` — `{ message: string, code?: string }`

Generic wrapper:
- `WebSocketMessage<T>` — `{ type: string, payload: T }`

**File: `api.ts`** — API response types:

- `EventDetailResponse` — `{ event: { code, status, current_stop, started_at, created_at }, participants: Array<{ id, display_name, is_lead, is_active }>, lead_name: string | null, current_participant: { id, display_name, is_lead } | null }` — `current_participant` is populated when the request includes a valid session cookie (used for auto-rejoin); null otherwise
- `JoinEventResponse` — `{ participant: { id, display_name, is_lead }, token: string, event: { code, status, current_stop }, messages: ChatMessagePayload[], participants: Array<{ id, display_name, is_lead, is_active }> }` — `token` is the session token the frontend must pass as a WebSocket query parameter (HTTP-only cookies cannot be read by JS)
- `MessageHistoryResponse` — `{ messages: ChatMessagePayload[] }`
- `CheckoutSessionResponse` — `{ url: string }`
- `CheckoutSuccessResponse` — `{ event_code: string, event_url: string }`
- `AdminDashboardResponse` — `{ counts: Record<EventStatus, number>, total_revenue_events: number, recent_events: Array<{ code, status, buyer_email, created_at }> }`
- `AdminEventListResponse` — `{ events: Array<{ id, code, buyer_email, status, created_at, participant_count: number }>, total: number, page: number, per_page: number }`
- `AdminEventDetailResponse` — `{ event: Event, participants: Participant[], messages: Message[], stripe_payment_id: string | null }`
- `AdminRouteDetailResponse` — `{ route: Route, stops: Stop[] }`

**File: `api-errors.ts`** — Standard error response:

- `ApiErrorResponse` — `{ error: string, code?: string }`
- Error codes: `EVENT_NOT_FOUND`, `EVENT_FULL`, `EVENT_EXPIRED`, `EVENT_COMPLETED`, `INVALID_INPUT`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL_ERROR`

**File: `llm.ts`** — LLM types:
- `IntentClassification` — `{ type: "answer-attempt" | "hint-request" | "contextual-comment" | "question" | "off-topic-chat" | "prompt-injection" | "inappropriate" | "clarification" }`
- `AnswerMatchResult` — `{ type: "answer-correct" | "answer-incorrect" }`
- `QuestionAnswerResult` — `{ type: "answer" | "unknown"; text?: string }`
- `GuideState` — `{ current_stop, wrong_attempts, hints_given, total_hints, intent }`

**File: `redis.ts`** — Redis pub/sub payload types (used by both HTTP and WS processes):
- `IncomingMessagePayload` — `{ event_id, event_code, participant_id, participant_name, text, message_id, timestamp }`
- `BroadcastMessagePayload` — same shape as `ChatMessagePayload`
- `TypingPayload` — `{ type: "participant_typing" | "guide_typing", participant_name: string | null, participant_id: string | null, is_typing: boolean }`
- `ControlEventPayload` — discriminated union on `type`:
  - `{ type: "game_started", data: { started_by: string } }`
  - `{ type: "hunt_complete", data: { summary: string } }`
  - `{ type: "participant_joined", data: { name: string, participant_count: number } }`
  - `{ type: "participant_left", data: { name: string, participant_count: number, reason: ParticipantLeftReason } }`

### 1.4 Shared Package — Validation Schemas (`packages/shared/src/validation/`)
Zod schemas used by both client and server:

**File: `user-input.ts`**:
- `displayNameSchema` — 1-30 chars, trimmed, no HTML tags, alphanumeric + spaces/hyphens/apostrophes
- `chatMessageSchema` — 2-500 chars, trimmed, not empty after trim
- `eventCodeSchema` — 6-8 alphanumeric chars, URL-safe

**File: `admin-input.ts`**:
- `routeSchema` — name required, duration > 0, distance > 0
- `stopSchema` — name required, clue required, >= 1 accepted answer, 2-3 hints
- `imageUploadSchema` — JPEG/PNG only, max 5MB

**File: `api-requests.ts`**:
- `joinEventRequestSchema` — display_name required, passes displayNameSchema
- `startEventRequestSchema` — participant token required

### 1.5 Shared Package — Constants (`packages/shared/src/constants/`)

**File: `index.ts`**:
All magic numbers from project-spec Section 2.2.3:
- Game limits: MAX_PARTICIPANTS (10), MAX_MESSAGE_LENGTH (500), MIN_MESSAGE_LENGTH (2), MAX_DISPLAY_NAME_LENGTH (30), MAX_GUIDE_RESPONSES_PER_EVENT (100)
- Timeouts: PARTICIPANT_OFFLINE_TIMEOUT_MS, IDLE_PROMPT_TIMEOUT_MS, IDLE_PAUSE_TIMEOUT_MS, WEBSOCKET_PING_INTERVAL_MS, TYPING_INDICATOR_DEBOUNCE_MS, GUIDE_RATE_LIMIT_MS, PARTICIPANT_RATE_LIMIT_COUNT, PARTICIPANT_RATE_LIMIT_WINDOW_MS
- Event lifecycle: EVENT_EXPIRY_DAYS (90), SESSION_TOKEN_EXPIRY_HOURS (24)
- Event code: EVENT_CODE_LENGTH (8), EVENT_CODE_ALPHABET

### 1.6 Shared Package — Utilities (`packages/shared/src/utils/`)

**File: `index.ts`**:
- `generateEventCode()` — random code from EVENT_CODE_ALPHABET
- `buildEventUrl(baseDomain: string, code: string)` — returns full event URL. Takes baseDomain as a parameter (not from env) so the shared package remains pure. Callers pass their env-configured domain.
- `buildS3Key(routeId: string, stopNumber: number, filename: string)` — returns `routes/${routeId}/stops/${stopNumber}/${filename}`
- `buildS3Url(cdnBaseUrl: string, key: string)` — returns full URL. Takes cdnBaseUrl as parameter.
- `formatTimestamp(date: Date)` — human-readable time for chat timestamp separators
- `isValidEventCode(code: string)` — validate against expected format (length + alphabet)

### 1.7 Shared Package — Tailwind Preset (`packages/shared/src/tailwind/`)

**File: `preset.ts`**:
Design tokens preset:
- Brand colours with shade scale
- Chat colours: bubble-self (#007AFF), bubble-other (#E9E9EB), bubble-guide (#F2F2F7), system-text (#8E8E93)
- Font family: system font stack
- Any shared border-radius, spacing tokens

### 1.8 Shared Package — PostHog Event Catalogue (`packages/shared/src/analytics/`)

**File: `index.ts`**:
- `POSTHOG_EVENTS` constant with all event names (marketing + app)
- `PostHogEventProperties` interface with typed properties per event
- `trackEvent<K>(eventName: K, properties: PostHogEventProperties[K])` — type-safe helper. This is a **type-only helper** — the actual `posthog.capture()` call is made by the consuming package. The consuming package wraps this function, injecting the PostHog client instance.

## Dependencies
- None (this is the foundation)

## Backend Tests
- Unit tests for all utility functions (generateEventCode, buildEventUrl, buildS3Key, buildS3Url, formatTimestamp, isValidEventCode)
- Unit tests for all Zod validation schemas (valid/invalid inputs for each schema)
- Unit tests for constants export (values match spec)
