# Spec 08: Admin Panel

## Goal
Build the admin panel for managing events, routes, stops, and message banks.

## Deliverables

### 8.1 Admin Package Setup
- Vite + React + TypeScript + Tailwind (extending shared preset)
- Environment variable: `VITE_API_URL`
- HTTP client utility wrapping `fetch` with `Authorization: Bearer <token>` header injection
- No PostHog (admin panel is internal)

### 8.2 Authentication
- Login page with username/password form
- POST `/admin/login` → receives JWT token
- Token stored in **localStorage** (simple, no cross-domain cookie complexity needed for internal tool)
- All API calls include `Authorization: Bearer <token>` header
- On 401 response from any API call: clear token, redirect to login
- Logout: clear localStorage token, redirect to login

### 8.3 Dashboard View
- Event counts by status (NOT_STARTED, WAITING, IN_PROGRESS, COMPLETED, EXPIRED) — displayed as stat cards
- Total revenue events count (approximate revenue = count × price, displayed for quick reference)
- Recent events list (last 10): code, buyer_email, status, created_at — click to navigate to event detail

### 8.4 Events List View
- Table of all events with columns: code, buyer_email, status, created_at, participant count
- Filterable by status (dropdown/select)
- **Pagination:** page-based with page/per_page controls. Default 20 per page. Show total count.
- Click row to navigate to event detail

### 8.5 Event Detail View
- Full event info: code, status, route name, created_at, started_at, completed_at, expires_at
- **Stripe payment ID** — displayed prominently with copy button (for quick Stripe Dashboard lookup for refunds)
- Buyer email
- Participant list table: display_name, is_lead (badge), is_active, joined_at, left_at, left_reason
- Full message log: scrollable, ordered by created_at. Each message shows: sender_name, sender_type (colour-coded), content, timestamp
- Current stop, hints_given, wrong_attempts, guide_response_count

### 8.6 Routes List View
- List all routes as cards or table: name, city, total_stops, is_active (toggle badge)
- Click to navigate to route editor
- "Create New Route" button

### 8.7 Route Editor View
- Route metadata form (validated via shared `routeSchema`):
  - name (text input, required)
  - city (text input, required)
  - description (textarea)
  - total_stops (auto-calculated from stops count, read-only)
  - estimated_duration_mins (number input, > 0)
  - estimated_distance_km (number input, > 0)
  - is_active (toggle switch)
- Save button: POST (create) or PUT (update) to API
- Stops section below:
  - Ordered list of stops showing stop_number and name
  - Drag-and-drop reorder (or up/down arrow buttons)
  - On reorder: PUT `/admin/routes/:id/stops/reorder` with new order
  - "Add Stop" button → opens stop editor
  - Click stop → opens stop editor

### 8.8 Stop Editor View
- All stop fields validated via shared `stopSchema`:
  - name (text input, required)
  - stop_number (displayed, auto from position)
  - directions_from_previous (textarea, required)
  - clue (textarea, required)
  - accepted_answers (tag/chip input — type answer, press Enter to add, click X to remove. Minimum 1.)
  - hints (ordered list — add/remove/reorder. Minimum 2, maximum 3.)
  - correct_response (textarea, optional — custom response text on correct answer)
  - fun_fact (textarea, required)
  - images (upload area — see §8.9)
  - google_maps_link (URL input, optional)
- Save button: POST (create) or PUT (update)
- Delete button with confirmation dialog

### 8.9 S3 Image Upload Flow
1. Admin selects file via file input or drag-and-drop
2. Client-side validation via shared `imageUploadSchema`: JPEG/PNG only, max 5MB
3. Call POST `/admin/upload` with `{ filename, content_type }`
4. API returns `{ upload_url, key }`
5. Frontend uploads directly to S3 using pre-signed PUT URL with correct `Content-Type` header
6. On upload success: add S3 key to stop's `images` array
7. Display: thumbnail preview using URL from shared `buildS3Url(cdnBaseUrl, key)`
8. Remove: click X on thumbnail, remove key from images array
- Show upload progress indicator
- Error handling: "Upload failed. Try again." on S3 PUT failure

**S3 Bucket Configuration (documented here for admin upload flow):**
- Bucket CORS: allow PUT from admin domain origin
- Content-Type restriction: image/jpeg, image/png
- Pre-signed URL expiry: 5 minutes

### 8.10 Message Banks View
- Tab selector or dropdown: success, failure, hint-exhausted, clarification, unknown-answer, opening, completion, over-length
- List entries for selected type: content preview (truncated), is_active toggle
- "Add New" button → inline form or modal with textarea for content
- Edit entry: click to expand/open editor
- Delete entry: with confirmation
- **Warning banner** if a bank type has < 5 active entries: "This bank has fewer than 5 active entries. Add more to reduce repetition."
- Opening and completion templates: show available `{{VARIABLE}}` placeholders as reference text above the editor:
  - Opening: `{{FIRST_STOP_DIRECTIONS}}`, `{{FIRST_CLUE}}`, `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`
  - Completion: `{{TOTAL_STOPS}}`, `{{DISTANCE_KM}}`, `{{CITY_NAME}}`, `{{REVIEW_LINK}}`
  - Hint-exhausted: `{{ANSWER}}`

## Dependencies
- Spec 01 (shared validation, Tailwind preset)
- Spec 02 (database — all tables)
- Spec 03 (API core — admin endpoints)

## Backend Tests
(Admin API endpoint tests are covered in Spec 03. No additional backend tests needed for the admin frontend.)
