# Spec 03: API Core Setup & HTTP Process

## Goal
Set up the Hono HTTP API process with middleware, database connection, Redis connection, and core REST endpoints.

## Deliverables

### 3.1 API Package Setup
- Hono framework on Node.js
- Two entry points: `src/http/index.ts` and `src/ws/index.ts` (WS process in separate spec)
- Scripts: `start:http`, `start:ws`, `dev:http`, `dev:ws`
- Environment variable loading (.env) with **startup validation** — fail fast with clear error message listing all missing required vars
- PostgreSQL connection pool via Drizzle ORM (same as migrations)
- Redis client (ioredis) — two instances: one for commands, one for pub/sub subscriber (see Spec 09 §9.3.2)
- CORS middleware configuration (see §3.5)
- Request logging middleware (structured JSON: method, path, status, duration)
- Error handling middleware (see §3.6)

### 3.2 CORS & Cookie Configuration

Cross-subdomain cookie auth requires precise CORS settings:

- **Allowed origins** (from env): marketing site origin, app origin, admin origin
- **`Access-Control-Allow-Credentials: true`** — required for cookies to be sent cross-origin
- **`Access-Control-Allow-Headers`**: Content-Type, Authorization
- **`Access-Control-Allow-Methods`**: GET, POST, PUT, PATCH, DELETE, OPTIONS

**Cookie settings** for participant session tokens:
- `HttpOnly: true`
- `Secure: true` (HTTPS only)
- `SameSite: None` — required for cross-subdomain cookies (app on `yourdomain.com/app/*` sending to `api.yourdomain.com`)
- `Domain: .yourdomain.com` (from env as `COOKIE_DOMAIN`) — allows cookie to be shared across subdomains
- `Path: /`
- `Max-Age`: SESSION_TOKEN_EXPIRY_HOURS in seconds

**Note:** `SameSite=None` requires `Secure=true`. This means HTTPS is required even for local development (or use `localhost` which browsers treat specially).

### 3.3 Event Endpoints

**POST `/checkout/create-session`**
- Accepts: nothing (price is server-side from STRIPE_PRICE_ID env var)
- Creates Stripe Checkout Session with:
  - `success_url`: `{MARKETING_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}` (Stripe template variable)
  - `cancel_url`: `{MARKETING_URL}`
  - `mode: 'payment'`
  - `customer_email`: collected by Stripe
- Returns: `CheckoutSessionResponse` `{ url: string }`

**POST `/webhook/stripe`**
- Raw body parsing (not JSON — Stripe needs raw bytes for signature verification)
- Validates Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`
- **Idempotency:** Check if an event with this `stripe_session_id` already exists before creating. If duplicate, return 200 without action.
- Handles `checkout.session.completed`:
  1. Extract `buyer_email` from `session.customer_details.email`
  2. Extract `payment_intent` from `session.payment_intent` (store as `stripe_payment_id`)
  3. Store `session.id` as `stripe_session_id`
  4. Generate event code via shared `generateEventCode()` — retry on unique constraint violation
  5. Look up the single active route (`WHERE is_active = true LIMIT 1`) to assign as `route_id`
  6. Insert event row: status NOT_STARTED, expires_at = now + EVENT_EXPIRY_DAYS
  7. Send confirmation email via Resend (see §3.8)
- Returns 200 to Stripe
- On any error after signature validation: log error, still return 200 (Stripe will retry on non-200)

**GET `/checkout/success`**
- Query param: `?session_id=...`
- Look up event by `stripe_session_id`
- Returns: `CheckoutSuccessResponse` `{ event_code: string, event_url: string }`
- 404 if no event found for this session
- This endpoint is called by the marketing site's success page to display the event link

**GET `/event/:code`**
- Validate code via shared `eventCodeSchema`
- If a valid session cookie is present: look up the participant and include as `current_participant` in the response (used for auto-rejoin on the frontend). This is optional — the endpoint works without a cookie.
- Returns: `EventDetailResponse` (event status, participant list with names/is_lead/is_active, lead user name, optional current_participant)
- 404 if event not found

**POST `/event/:code/join`**
- Validate body via shared `joinEventRequestSchema`
- Check event exists, not EXPIRED, not COMPLETED
- Check participant count < MAX_PARTICIPANTS — return 403 with `EVENT_FULL` code if exceeded
- Generate cryptographically random session token (`crypto.randomUUID()` or equivalent)
- Insert participant row (is_lead: true if first joiner for this event)
- If first joiner: set event.lead_participant_id to this participant, update status to WAITING
- Store token in Redis session store (see Spec 09 §9.4)
- Set HTTP-only cookie (see §3.2 for cookie settings)
- Publish `participant_joined` to Redis control channel
- Returns: `JoinEventResponse` (participant data including `token` for WebSocket auth, event state, full message history, participant list)

**POST `/event/:code/start`**
- Authenticate via session middleware (§3.4)
- Verify participant is_lead for this event
- Verify event status is WAITING
- Update event status to IN_PROGRESS, set started_at = now, current_stop = 1
- Select random active opening template from message_banks WHERE type = 'opening'
- Look up first stop data (stop_number = 1 for the event's route)
- Populate template: replace `{{FIRST_STOP_DIRECTIONS}}`, `{{FIRST_CLUE}}`, `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`
- Insert opening message(s) into messages table (sender_type: 'guide', sender_name: 'Guide', step_number: 1)
- If stop has images, include first image URL in a separate message or inline
- Publish `game_started` to Redis control channel
- Publish opening message(s) to Redis messages channel
- Returns: 200

**POST `/event/:code/leave`**
- Authenticate via session middleware
- Set participant is_active = false, left_at = now, left_reason = 'voluntary'
- If participant was lead AND event status is WAITING: reassign lead to next chronological joiner (`is_active = true ORDER BY joined_at ASC LIMIT 1`)
- Invalidate session token in Redis (DELETE)
- Clear cookie (set Max-Age: 0)
- Publish `participant_left` (reason: voluntary) to Redis control channel
- Returns: 200

**GET `/event/:code/messages`**
- Optional query param: `?since=[ISO timestamp]` for catch-up after reconnection
- Read from Redis cache first (LRANGE on `chat:{code}:messages`), fall back to PostgreSQL
- If `since` param provided: filter to messages with `created_at > since`
- Returns: `MessageHistoryResponse` `{ messages: ChatMessagePayload[] }` ordered by created_at ASC

### 3.4 Session/Auth Middleware
- Cookie-based participant authentication middleware
- Reads session token from HTTP-only cookie (cookie name: `cityroam_session`)
- Validates token against Redis (fast path) with PostgreSQL fallback
- On Redis miss + DB hit: re-populate Redis session store
- Attaches participant + event context to Hono request context (via `c.set()`)
- Returns 401 with `UNAUTHORIZED` error code if invalid/missing
- Applied to: `/event/:code/start`, `/event/:code/leave`

### 3.5 Rate Limiting
- Join endpoint: 20 attempts per event per minute (Redis counter, see Spec 09 §9.7)
- Implemented as Hono middleware applied to `/event/:code/join`
- Returns 429 with `RATE_LIMITED` error code when exceeded

### 3.6 Error Response Format
All error responses use a consistent shape:
```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```
Matching the `ApiErrorResponse` type from Spec 01.

The error handling middleware catches all thrown errors and maps them:
- Zod validation errors → 400 with `INVALID_INPUT`
- Known application errors (EventNotFound, EventFull, etc.) → appropriate status + code
- Unhandled errors → 500 with `INTERNAL_ERROR` (do not leak stack traces in production)

### 3.7 Admin Auth & Endpoints

**Admin authentication:**
- Single admin account with credentials from env vars (`ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- POST `/admin/login` — accepts `{ username, password }`, returns JWT token (short-lived, 8 hours)
- Admin middleware: validates JWT from `Authorization: Bearer <token>` header
- Admin panel uses `Authorization` header (not cookies) to avoid cross-domain cookie complexity

**Admin endpoints** (all require admin auth middleware):

- GET `/admin/dashboard` → `AdminDashboardResponse`
- GET `/admin/events?status=X&page=1&per_page=20` → `AdminEventListResponse` (pagination: page-based, default 20 per page)
- GET `/admin/events/:id` → `AdminEventDetailResponse`
- PATCH `/admin/events/:id` — update status only: `{ status: EventStatus }`
- GET `/admin/routes` → `{ routes: Route[] }`
- POST `/admin/routes` — create route, validated via shared `routeSchema`
- GET `/admin/routes/:id` → `AdminRouteDetailResponse`
- PUT `/admin/routes/:id` — update route
- DELETE `/admin/routes/:id` — delete route. Reject with 409 if any events reference this route.
- POST `/admin/routes/:id/stops` — add stop, validated via shared `stopSchema`
- PUT `/admin/routes/:id/stops/:stopId` — update stop
- DELETE `/admin/routes/:id/stops/:stopId` — delete stop, reorder remaining stops
- PUT `/admin/routes/:id/stops/reorder` — body: `{ stop_ids: string[] }` (ordered array), updates stop_number for each
- POST `/admin/upload` — accepts `{ filename, content_type }` validated via shared `imageUploadSchema`. Generates pre-signed S3 PUT URL (expiry: 5 minutes). Returns `{ upload_url: string, key: string }`
- GET `/admin/message-banks?type=success` — list all, filterable by type
- POST `/admin/message-banks` — create entry: `{ type, content }`
- PUT `/admin/message-banks/:id` — update entry
- DELETE `/admin/message-banks/:id` — delete entry

### 3.8 Resend Email Integration

Confirmation email sent after successful Stripe webhook:

**Configuration:**
- Resend API key from `RESEND_API_KEY` env var
- Sender: `RESEND_FROM_EMAIL` (e.g., "City Roam <hello@yourdomain.com>")

**Email content:**
- Subject: "Your City Roam treasure hunt is booked!"
- Body (HTML):
  - Event link prominently displayed with clear CTA button
  - Brief instructions: "Share this link with your group. Everyone opens it, enters their name, and the lead person starts when ready."
  - Expiry note: "Your event is available for 90 days."
  - Refund policy: "Not happy? Reply to this email for a full refund, no questions asked."
  - Support contact email

**Error handling:** If Resend fails, log the error but do NOT fail the webhook. The event is already created. A missing email is recoverable (admin can look up the event code).

### 3.9 Health Check
- GET `/health` → 200 `{ status: "ok", db: "ok", redis: "ok" }`
- Checks PostgreSQL connectivity (SELECT 1) and Redis connectivity (PING)
- Returns 503 if either check fails

### 3.10 Event Expiry
- **Lazy evaluation:** On `GET /event/:code`, if `expires_at < now` and status is NOT `COMPLETED`, update status to `EXPIRED` before returning.
- **Background sweep (HTTP process):** A `setInterval` (every 6 hours) queries for events where `expires_at < now AND status NOT IN ('COMPLETED', 'EXPIRED')` and batch-updates them to `EXPIRED`. This ensures events are expired even if nobody accesses them.
- This prevents stale events from accumulating in the database.

## Dependencies
- Spec 01 (shared types, validation, constants, utils)
- Spec 02 (database schema)
- Spec 09 (Redis layer)

## Backend Tests
- POST `/checkout/create-session` returns Stripe session URL (mock Stripe SDK)
- POST `/webhook/stripe` creates event + sends email on valid webhook (mock Stripe + Resend)
- POST `/webhook/stripe` rejects invalid signature
- POST `/webhook/stripe` is idempotent (duplicate session_id does not create second event)
- GET `/checkout/success` returns event code for valid session_id, 404 for unknown
- GET `/event/:code` returns event details, 404 for missing
- POST `/event/:code/join` — success case with cookie set, response includes participant + event + messages
- POST `/event/:code/join` — rejects invalid display name (Zod error)
- POST `/event/:code/join` — enforces MAX_PARTICIPANTS cap
- POST `/event/:code/join` — first joiner becomes lead, status transitions to WAITING
- POST `/event/:code/start` — only lead can start
- POST `/event/:code/start` — only from WAITING status
- POST `/event/:code/start` — inserts opening message with template variables populated
- POST `/event/:code/leave` — sets inactive, publishes event, clears cookie
- POST `/event/:code/leave` — lead reassignment when lead leaves in WAITING status
- GET `/event/:code/messages` — returns messages in order
- GET `/event/:code/messages` — respects `since` filter
- Rate limiting: 21st join attempt in 1 minute is rejected with 429
- Session middleware: valid cookie passes, invalid/missing rejects with 401
- Admin login: valid credentials return JWT, invalid rejected
- Admin auth middleware: valid JWT passes, missing/invalid rejected
- Admin dashboard returns correct counts
- Admin events list with pagination and status filter
- Admin event detail includes participants, messages, stripe_payment_id
- Admin route CRUD with referential integrity check on delete
- Admin stop CRUD with reorder
- Admin upload returns valid pre-signed URL (mock S3)
- Admin message bank CRUD with type validation
- Health check returns 200 when services healthy, 503 when not
- Error middleware returns consistent error shape for all error types
- GET `/event/:code` with valid session cookie returns `current_participant` (auto-rejoin)
- GET `/event/:code` without cookie returns `current_participant: null`
- Event expiry: lazy evaluation marks expired events on access
- Event expiry: background sweep marks expired events
