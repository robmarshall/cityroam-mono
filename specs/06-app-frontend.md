# Spec 06: Frontend App (Vite + React)

## Goal
Build the participant-facing web app: join screen, lobby, SMS-style chat, and completion screen.

## Deliverables

### 6.1 App Package Setup
- Vite + React + TypeScript + Tailwind (extending shared preset from `@cityroam/shared/tailwind`)
- React Router v6 for client-side routing
- **Headless UI** (`@headlessui/react`) for accessible dialog/modal components
- Environment variables: `VITE_API_URL`, `VITE_WS_URL`, `VITE_POSTHOG_KEY`
- PostHog SDK initialization with shared event catalogue from `@cityroam/shared/analytics`
- **State management:** React Context for global state (current participant, event data, WebSocket connection). No external state library — the app is simple enough for Context + useReducer.
- HTTP client utility wrapping `fetch` with `credentials: 'include'` (required for cookie auth) and `VITE_API_URL` prefix

### 6.2 Routes

| Route | View | Component |
|---|---|---|
| `/app/hunt/:code` | Join screen | `JoinPage` |
| `/app/hunt/:code/lobby` | Waiting lobby | `LobbyPage` |
| `/app/hunt/:code/play` | Game chat | `ChatPage` |
| `/app/hunt/:code/complete` | Completion | `CompletePage` |

### 6.3 Join Screen (`JoinPage`)
- Display name input validated via shared `displayNameSchema` (from `@cityroam/shared/validation`)
- Submit button ("Join the Hunt")
- On submit: POST `/event/:code/join` with `{ display_name }`
- On success: store returned participant data in React Context, redirect to:
  - `/lobby` if event status is NOT_STARTED or WAITING
  - `/play` if event status is IN_PROGRESS (late joiner)
- **Auto-rejoin:** on mount, call GET `/event/:code` — if the API returns participant data (session cookie still valid), skip join screen and redirect appropriately. The API identifies the participant from the cookie.
- **Error states with user-friendly messages:**
  - Event not found (404): "This hunt doesn't exist. Check the link and try again."
  - Event full (403 EVENT_FULL): "This hunt is full — no more spaces available."
  - Event expired (403 EVENT_EXPIRED): "This hunt has expired."
  - Event completed (403 EVENT_COMPLETED): "This hunt has already finished."
  - Network error: "Couldn't connect. Check your signal and try again."
- PostHog: track `hunt_joined` on successful join

### 6.4 Waiting Lobby (`LobbyPage`)
- Participant list with display names and subtle green dot for online status
- If current user is lead: show "Start the Hunt" button (prominent, centred)
- If not lead: show "Waiting for [lead name] to start the hunt..."
- WebSocket connection established here (connect to `VITE_WS_URL/ws/:code?token=...`)
  - Note: token must be passed as query param since HTTP-only cookies cannot be read by JS. The join response includes the token for this purpose — store it in React Context (in-memory only, not localStorage).
- Listen for: `participant_joined` (update list), `participant_left` (update list), `game_started` (navigate to play)
- On `game_started`: navigate to `/app/hunt/:code/play`
- No chat in lobby
- Lead start action: POST `/event/:code/start`
- PostHog: track `hunt_started` (lead only)
- If event transitions to IN_PROGRESS while in lobby (e.g., another tab started it): auto-navigate to play

### 6.5 SMS-Style Chat (`ChatPage`)
This is the core UI. Must feel like a native SMS or iMessage conversation.

**Message Bubbles:**
- Current user: right-aligned, `bubble-self` colour (Tailwind class from shared preset), white text, rounded-2xl with rounded-br-sm
- Other participants: left-aligned, `bubble-other` colour, dark text, sender name above in small muted text, rounded-2xl with rounded-bl-sm
- Guide messages: left-aligned, `bubble-guide` colour, small compass/map-pin icon as avatar, "Guide" label above first message in a consecutive sequence
- System messages: centred, small text, `system-text` colour, no bubble (e.g., "[Name] joined the hunt")

**Current user identification:** The `JoinEventResponse` returns the participant's `id`. Store this in React Context. When rendering messages, compare `message.participant_id` to the stored ID to determine right/left alignment.

**Timestamps:**
- Time separators between messages > 5 minutes apart (not on every message)
- Use shared `formatTimestamp()` from `@cityroam/shared/utils`
- Render as centred muted text between message groups

**Input Area:**
- Pinned to bottom
- Text input + send button (arrow icon)
- Expands for multi-line (up to 3 lines via `max-height`, then internal scroll)
- Send on Enter, Shift+Enter for newline (desktop)
- Validate against shared `chatMessageSchema` before sending — disable send button if invalid
- **Visual Viewport API:** listen to `window.visualViewport` resize events to adjust chat container height when mobile keyboard appears. This prevents the input from being hidden behind the keyboard.
- On send: emit `user_message` via WebSocket, clear input, emit `typing_stop`

**Scroll Behaviour:**
- Auto-scroll to bottom on new messages unless user has scrolled up (track via scroll position)
- "New messages ↓" pill appears when new messages arrive while scrolled up — clicking scrolls to bottom
- On initial load: scroll to bottom

**Images:**
- Guide messages with `image_url`: render as rounded-xl images within the message flow (max-width: 280px)
- Tap/click to open full-screen overlay: Headless UI `Dialog` with fade + scale transitions
- Overlay: image centred, dark backdrop, X close button top-right, click backdrop to close

**Typing Indicators:**
- Guide typing: pulsing dots animation (three dots with staggered CSS animation) in a left-aligned bubble-guide coloured bubble
- Participant typing: "[Name] is typing..." as small muted text below the last message
- Multiple participants: "Multiple people are typing..."
- Show/hide with debounce at TYPING_INDICATOR_DEBOUNCE_MS

**Connection State:**
- Subtle banner at top of chat: "Reconnecting..." with yellow background when WebSocket disconnected
- Brief "Connected" with green background on reconnection, auto-hide after 2 seconds

**WebSocket Integration:**
- Connect on mount (reuse connection from lobby if navigated from there)
- Send: `user_message`, `typing_start` (on keypress, debounced), `typing_stop` (on send or after TYPING_INDICATOR_DEBOUNCE_MS idle), `ping` (every WEBSOCKET_PING_INTERVAL_MS)
- Receive: `chat_message` (append to message list), `guide_typing`, `participant_typing`, `participant_joined` (system message + update participant list), `participant_left` (system message + update list), `hunt_complete` (navigate to complete), `error` (display toast)
- **Auto-reconnect strategy:**
  - On unexpected close (not code 4001-4005): attempt reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s max)
  - On reconnect: call GET `/event/:code/messages?since={lastMessageTimestamp}` to catch up missed messages
  - On close code 4001/4002 (auth failure): redirect to join screen
  - On close code 4003/4004/4005: show appropriate error message
  - Max reconnect attempts: 10, then show "Unable to reconnect" with manual retry button

**Leave Hunt:**
- Menu icon (three dots or gear) in top-right
- "Leave Hunt" option in dropdown
- Confirmation dialog: "Are you sure you want to leave? You can rejoin later with the same link."
- On confirm: POST `/event/:code/leave`, clear local state, navigate to join screen
- PostHog: track `hunt_abandoned`

**On `hunt_complete`:**
- Navigate to `/app/hunt/:code/complete`
- Pass completion summary from the `HuntCompletePayload` via React Router state

### 6.6 Completion Screen (`CompletePage`)
- Display completion summary from router state (or re-fetch from last messages if state missing)
- Google Reviews link button (URL from env or hardcoded for MVP)
- TripAdvisor link button
- "Share with friends" button using Web Share API (fallback: copy link to clipboard)
- PostHog: track `hunt_completed` with duration + stops, `review_link_clicked`

### 6.7 Responsive Design
- Primary target: mobile (375px-430px viewport)
- Desktop functional but not priority — chat area centred with max-width ~480px
- No tablet-specific optimisation

### 6.8 PostHog Integration
- Initialise on app mount with `VITE_POSTHOG_KEY`
- `posthog.identify()` with participant ID after join (for cross-session tracking)
- Import event names from `@cityroam/shared/analytics`
- Track: hunt_joined, hunt_started, hunt_completed, hunt_abandoned, review_link_clicked, participant_reconnected (on successful WebSocket reconnect after disconnect)

## Dependencies
- Spec 01 (shared types, validation, constants, Tailwind preset, analytics)
- Spec 03 (API HTTP endpoints)
- Spec 05 (WebSocket process)

## Backend Tests
- None (frontend package — no backend tests per instructions)
