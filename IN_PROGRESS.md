# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: 3.2 Redis client setup — ioredis with 2 instances per process (commands + pub/sub), session store (set/get/delete with TTL), chat cache (RPUSH/LRANGE with 24h TTL), rate limiting (INCR+EXPIRE fixed window for join/guide/participant limits)
- **Spec File**: specs/09-redis-and-real-time.md
- **Stage**: commit
- **Started**: 2026-03-27T00:00:00Z
- **Last Heartbeat**: 2026-03-27T15:10:00Z
- **Inner Loop Count**: 6

## Stage Status
- [x] implement - Complete
- [x] test - Passed
- [x] review - Passed

## TODOs (feed back to implement)
- [x] Review: packages/api/src/redis/pubsub.ts:68-73 - `subscribeToIncomingPattern` adds a `pmessage` listener each call but never removes it. If called more than once (e.g. reconnection), duplicate listeners accumulate. Store handler ref and provide cleanup.
- [x] Review: packages/api/src/redis/pubsub.ts:92-103 - `subscribeToEvent` adds a new `message` listener each call via `.on("message", ...)`. When `unsubscribeFromEvent` is called (lines 106-112), it unsubscribes from channels but does NOT remove the listener. This causes listener leak — stale closures fire on every subsequent message. Fix: store handler references in a Map keyed by event code, and call `redisSub.off("message", handler)` in `unsubscribeFromEvent`.
- [x] Review: JSON.parse without try-catch at system boundaries — session.ts:28, chat-cache.ts:23, pubsub.ts:78/110/112/114. Corrupted Redis data will throw uncaught exceptions crashing handlers. Wrap each JSON.parse in try-catch, return null or skip the message on parse failure.
- [x] Review: rate-limit.ts:19-22 — INCR and EXPIRE are separate commands, not atomic. If process crashes between them the key persists forever without TTL, causing permanent rate limit lockout. Replace with a Lua script that does INCR+conditional EXPIRE atomically.

## Files Modified
- packages/api/src/redis.ts (deleted)
- packages/api/src/redis/client.ts (new)
- packages/api/src/redis/session.ts (new)
- packages/api/src/redis/chat-cache.ts (new)
- packages/api/src/redis/rate-limit.ts (new)
- packages/api/src/redis/pubsub.ts (new)
- packages/api/src/redis/index.ts (new)
- packages/api/src/http/index.ts (modified)
- packages/api/src/ws/index.ts (modified)

## Iteration Log
- Loop 1: Starting implementation of Redis session store, chat cache, rate limiting, and pub/sub helpers
- Loop 2: Implemented all 4 Redis service modules. Refactored redis.ts into redis/ directory with client.ts, session.ts, chat-cache.ts, rate-limit.ts, pubsub.ts, and index.ts barrel. Updated HTTP and WS server imports. TypeScript compiles clean.
- Loop 2 (test): Build passed, all 77 tests passed (shared package), typecheck passed. Advancing to review.
- Loop 3 (review): Review found issues — pubsub.ts has listener leak: both subscribeToEvent and subscribeToIncomingPattern add event listeners that are never cleaned up on unsubscribe. Looping back to implement.
- Loop 4 (implement): Fixed both listener leak issues in pubsub.ts. subscribeToIncomingPattern now returns a cleanup function that removes the pmessage handler and punsubscribes. subscribeToEvent stores its message handler in an eventMessageHandlers Map keyed by event code; unsubscribeFromEvent now calls redisSub.off() to remove the handler before unsubscribing channels. TypeScript compiles clean.
- Loop 4 (test): Build passed, all 77 tests passed (shared package), typecheck passed. Advancing to review.
- Loop 5 (review): Review found issues — (1) JSON.parse without try-catch in session.ts, chat-cache.ts, pubsub.ts at system boundaries, (2) rate-limit.ts INCR+EXPIRE race condition needs Lua script for atomicity. Looping back to implement.
- Loop 6 (implement): Fixed JSON.parse try-catch in session.ts (return null), chat-cache.ts (flatMap to skip corrupted entries), pubsub.ts (skip corrupted messages in both pmessage and message handlers). Replaced rate-limit.ts INCR+EXPIRE with atomic Lua script. TypeScript compiles clean.
- Loop 6 (test): Build passed, all 77 tests passed (shared package), typecheck passed. Advancing to review.
- Loop 6 (review): Review passed — all 4 prior issues verified fixed (listener leaks, JSON.parse safety, atomic rate limiting). Spec compliance confirmed for §9.1/9.2/9.3/9.4/9.7. Advancing to commit.

## Blockers
(none)
