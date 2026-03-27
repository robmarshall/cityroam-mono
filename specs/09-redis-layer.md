# Spec 09: Redis Layer

## Goal
Implement all Redis-backed features: caching, pub/sub, sessions, presence, typing indicators, and rate limiting.

## Deliverables

### 9.1 Redis Client Setup
- Single shared Redis client configuration used by both HTTP and WS processes
- Connection from environment variables (REDIS_URL)
- Graceful disconnect on process shutdown
- **Two separate client instances per process:** one for commands, one for pub/sub subscriptions (required by Redis — a subscribing client cannot issue other commands)

### 9.2 Chat History Caching
- Cache **all messages for an event** (not just current step): key pattern `chat:{code}:messages`
- Store as a Redis List (RPUSH to append, LRANGE to read)
- Each entry is a JSON-serialised `ChatMessagePayload`
- **Message write sequence (critical):** For every new message (user or guide): (1) INSERT into PostgreSQL, (2) RPUSH to Redis cache list, (3) PUBLISH to Redis pub/sub channel `event:{code}:messages`. This three-step sequence ensures durability (DB first), fast reads (cache second), and real-time delivery (pub/sub last).
- Read path: try Redis LRANGE first; on cache miss, query PostgreSQL and backfill Redis
- For `?since=` queries: filter in application code after reading from Redis, or fall back to PostgreSQL `WHERE created_at > $1`
- TTL: 24 hours (reset on each write via EXPIRE)
- On event COMPLETED or EXPIRED: let cache expire naturally

### 9.3 Pub/Sub Channels

| Channel Pattern | Publisher | Subscriber | Purpose |
|---|---|---|---|
| `event:{code}:incoming` | WS process | HTTP process | User messages for AI processing |
| `event:{code}:messages` | HTTP process | WS process | New messages to broadcast |
| `event:{code}:typing` | WS process | WS process | Typing indicator events |
| `event:{code}:control` | HTTP process | WS process | Control: game_started, hunt_complete, participant_joined, participant_left |

#### 9.3.1 Pub/Sub Message Payload Schemas

**`event:{code}:incoming`** — User message forwarded for AI processing:
```json
{
  "event_id": "uuid",
  "event_code": "ABCD1234",
  "participant_id": "uuid",
  "participant_name": "Alice",
  "text": "Is it the Town Hall?",
  "message_id": "uuid",
  "timestamp": "2026-03-27T12:00:00Z"
}
```

**`event:{code}:messages`** — New message to broadcast to all clients:
```json
{
  "id": "uuid",
  "sender_type": "user | guide | system",
  "sender_name": "Alice | Guide | System",
  "participant_id": "uuid | null",
  "content": "message text",
  "image_url": "https://cdn.example.com/routes/xxx/stops/1/photo.jpg | null",
  "step_number": 1,
  "created_at": "2026-03-27T12:00:00Z"
}
```

**`event:{code}:typing`** — Typing indicator:
```json
{
  "type": "participant_typing | guide_typing",
  "participant_name": "Alice | null",
  "participant_id": "uuid | null",
  "is_typing": true
}
```

**`event:{code}:control`** — Control events:
```json
{
  "type": "game_started | hunt_complete | participant_joined | participant_left",
  "data": {
    // game_started:
    "started_by": "Alice",
    // hunt_complete:
    "summary": "completion message text",
    // participant_joined:
    "name": "Bob", "participant_count": 4,
    // participant_left:
    "name": "Bob", "participant_count": 3, "reason": "voluntary | timeout"
  }
}
```

#### 9.3.2 HTTP Process Subscription Architecture

The HTTP process must run a **background Redis subscriber** alongside its Hono HTTP server. Implementation:

1. On HTTP process startup, create a dedicated Redis subscriber client
2. The subscriber listens on a **pattern subscription**: `event:*:incoming`
3. On receiving a message, extract the event code from the channel name and deserialise the payload
4. Pass the payload to `processIncomingMessage()` (the AI pipeline entry point from Spec 04)
5. The subscriber runs in the same Node.js event loop as the HTTP server — no worker threads needed
6. On process shutdown, unsubscribe and disconnect the subscriber client

This means the HTTP process has two Redis connections: one for commands (cache reads/writes, pub/sub publishing) and one for the `incoming` subscription.

### 9.4 Session Store
- Key pattern: `session:{token}` -> JSON `{ participant_id, event_id, event_code }`
- TTL: SESSION_TOKEN_EXPIRY_HOURS (24 hours) from shared constants
- Set on join, delete on leave
- Validate on every authenticated request (HTTP) and WebSocket connection

### 9.5 Presence Tracking
- Key pattern: `presence:{code}:{participant_id}` -> timestamp (last_seen_at)
- Updated on every ping from WebSocket client
- TTL: PARTICIPANT_OFFLINE_TIMEOUT_MS + 60s buffer
- Background check in WS process (setInterval at 60s) scans presence keys per active event to detect timeouts

### 9.6 Typing Indicators
- Key pattern: `typing:{code}:{participant_id}` -> `1`
- TTL: TYPING_INDICATOR_DEBOUNCE_MS (auto-expire)
- Set on typing_start, delete on typing_stop or message send
- Broadcast via `event:{code}:typing` pub/sub channel using the payload schema above

### 9.7 Rate Limiting
- Guide rate limit: `ratelimit:guide:{code}` — one guide response per GUIDE_RATE_LIMIT_MS per event
- Participant rate limit: `ratelimit:participant:{code}:{participant_id}` — PARTICIPANT_RATE_LIMIT_COUNT messages per PARTICIPANT_RATE_LIMIT_WINDOW_MS
- Join rate limit: `ratelimit:join:{code}` — 20 attempts per minute
- Implementation: Redis INCR with EXPIRE (fixed window). On INCR: if result is 1, set EXPIRE to the window duration. If result exceeds limit, reject.

### 9.8 Guide Typing State
- HTTP process publishes `guide_typing: true` to `event:{code}:typing` channel (using the typing payload schema above) before starting LLM call
- HTTP process publishes `guide_typing: false` after response is sent or on LLM timeout/failure
- WS process receives via `event:{code}:typing` subscription and broadcasts to clients
- No separate Redis key needed — guide typing is communicated entirely via pub/sub

## Dependencies
- Spec 01 (shared constants)
- Spec 03 (API core — Redis connection)

## Backend Tests
- Session store: set, get, delete, TTL expiry
- Chat cache: append message, read messages, full history retrieval
- Chat cache: fallback to PostgreSQL when cache miss
- Pub/sub: publish on one channel, subscriber receives with correct payload shape
- Pub/sub: HTTP process `incoming` pattern subscription receives messages
- Presence: update timestamp, detect timeout after threshold
- Rate limiting: allow under limit, block over limit, reset after window
- Typing indicators: set, auto-expire, broadcast via pub/sub
- Guide typing: publish true/false on typing channel, verify payload
