# Spec 05: API WebSocket Process

## Goal
Implement the WebSocket server process that handles real-time connections, message relay, typing indicators, and presence tracking.

## Deliverables

### 5.1 WebSocket Server Setup
- Separate Hono entry point: `src/ws/index.ts`
- Connection URL pattern: `wss://api.yourdomain.com/ws/:code`
- Token passed via query parameter: `?token=<participant-token>`
- Start script: `npm run start:ws`
- Shared Redis and PostgreSQL connections with HTTP process (same config, separate instances)
- Two Redis client instances: one for commands, one for pub/sub subscriptions

### 5.2 Connection Authentication
- On WebSocket upgrade: extract event code from URL path and token from query parameter
- Validate token against Redis session store (fast path) then PostgreSQL fallback
- On Redis miss + DB hit: re-populate Redis session store

**WebSocket Close Codes:**
| Code | Meaning |
|---|---|
| 4001 | Invalid or missing token |
| 4002 | Expired session |
| 4003 | Event not found |
| 4004 | Event completed or expired |
| 4005 | Participant not active (left or timed out) |

- On success: associate connection with event + participant in memory

### 5.3 Client → Server Message Handling

All client messages are JSON-parsed `WebSocketMessage<T>` wrappers with a `type` field.

**user_message `{ text: string }`**
- Validate text against shared `chatMessageSchema` — reject with `error` message if invalid
- Publish to Redis channel `event:{code}:incoming` using the `IncomingMessagePayload` format (see Spec 09 §9.3.1). Include a generated message UUID.
- The message broadcast and DB persistence is handled by the HTTP process pipeline (Spec 04 §4.11 steps 4-5). The WS process does NOT write user messages to DB or broadcast them directly.

**typing_start `{}`**
- Set typing key in Redis (see Spec 09 §9.6)
- Publish to Redis channel `event:{code}:typing` using `TypingPayload` format with `type: "participant_typing"`, `is_typing: true`

**typing_stop `{}`**
- Delete typing key in Redis
- Publish to Redis channel `event:{code}:typing` with `is_typing: false`

**ping `{}`**
- Respond with `pong` message immediately
- Update presence in Redis (see Spec 09 §9.5)

### 5.4 Redis Pub/Sub Subscriptions

The WS process uses a dedicated Redis subscriber client. For each event with at least one connected client, subscribe to:

| Channel | Action |
|---|---|
| `event:{code}:messages` | Deserialise `BroadcastMessagePayload`, wrap in `WebSocketMessage<ChatMessagePayload>`, broadcast to ALL connected clients for that event |
| `event:{code}:typing` | Deserialise `TypingPayload`. If `type: "participant_typing"`: broadcast to all clients EXCEPT the sender (match by participant_id). If `type: "guide_typing"`: broadcast to all clients. |
| `event:{code}:control` | Deserialise `ControlEventPayload`. Map `type` to the corresponding `WebSocketMessage` type (game_started, hunt_complete, participant_joined, participant_left) and broadcast to all connected clients. |

**Subscription lifecycle:**
- Subscribe to event channels when the first client connects for that event
- Unsubscribe when the last client disconnects for that event
- Track active subscriptions to prevent duplicates

### 5.5 Server → Client Messages
All messages use the `WebSocketMessage<T>` wrapper from shared types:
- `chat_message` — `ChatMessagePayload`
- `guide_typing` — `GuideTypingPayload`
- `participant_typing` — `ParticipantTypingPayload`
- `participant_joined` — `ParticipantJoinedPayload`
- `participant_left` — `ParticipantLeftPayload`
- `game_started` — `GameStartedPayload`
- `hunt_complete` — `HuntCompletePayload`
- `pong` — `PongPayload`
- `error` — `ErrorPayload`

### 5.6 Presence Tracking
- On connect: update participant `last_seen_at` in Redis presence key, mark as connected
- On each ping: update `last_seen_at` in Redis
- On disconnect: do NOT immediately remove. The presence key TTL handles eventual expiry.
- Background interval (every 60 seconds via setInterval): for each active event, scan presence keys:
  - If `last_seen_at` > PARTICIPANT_OFFLINE_TIMEOUT_MS ago and participant has no active WebSocket connection: set participant `is_active = false`, `left_at = now`, `left_reason = 'timeout'` in DB. Publish `participant_left` with `reason: "timeout"` to Redis control channel.

### 5.7 Connection Management
- Track all active connections per event in memory: `Map<eventCode, Map<participantId, WebSocket>>`
- On connection close: remove from in-memory map, update Redis presence (but do not delete key — let TTL handle it)
- Graceful shutdown: iterate all connections, send close frame with code 1001 (Going Away), close all connections, unsubscribe from all Redis channels, disconnect Redis clients

### 5.8 Guide Typing Indicator
- Received via `event:{code}:typing` channel subscription (see §5.4)
- Guide typing messages have `type: "guide_typing"` in the `TypingPayload`
- Broadcast `guide_typing` WebSocket message to all connected clients for that event

### 5.9 Health Check
- GET `/health` on the WS server (separate from the HTTP health check) → 200 `{ status: "ok", redis: "ok", connections: number }`
- Checks Redis connectivity and reports active WebSocket connection count
- Used by Coolify for health monitoring of the WS process

## Dependencies
- Spec 01 (shared types — WebSocket message types, constants)
- Spec 02 (database — participants table)
- Spec 03 (API core — Redis/DB connection config)
- Spec 09 (Redis — pub/sub channels, session store, presence, typing)

## Backend Tests
- Connection: valid token connects successfully
- Connection: invalid token rejected with close code 4001
- Connection: expired session rejected with close code 4002
- Connection: completed event rejected with close code 4004
- user_message: valid message published to `incoming` channel with correct payload shape
- user_message: invalid message (fails chatMessageSchema) returns error, not published
- typing_start: sets Redis key and publishes to typing channel
- typing_stop: deletes Redis key and publishes to typing channel
- typing broadcast: participant typing not sent back to sender
- ping: responds with pong, updates presence
- Redis subscription: messages from HTTP process broadcast to all clients
- Redis subscription: control events (game_started, hunt_complete, participant_joined, participant_left) broadcast correctly with mapped message types
- Subscription lifecycle: subscribes on first connect, unsubscribes on last disconnect
- Presence: participant marked inactive after PARTICIPANT_OFFLINE_TIMEOUT_MS with no active connection
- Presence: participant_left event published with reason "timeout"
- Presence: participant with active connection NOT timed out even if ping is late
- Connection cleanup: disconnected client removed from in-memory map
- Guide typing: relayed from typing channel to clients
- Graceful shutdown: all connections closed with 1001 code
- WS health check: GET /health returns 200 with connection count and Redis status
