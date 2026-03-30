# City Roam API Reference — Route Authoring

Base URL: provided by the City Roam admin (e.g. `https://api.cityroam.co.uk`)

## Authentication

All endpoints require admin JWT authentication.

**Step 1 — Get a token:**

```
POST /admin/login
Content-Type: application/json

{ "username": "<admin_username>", "password": "<admin_password>" }
```

Response:
```json
{ "token": "eyJhbG..." }
```

**Step 2 — Use the token on all subsequent requests:**

```
Authorization: Bearer <token>
```

Tokens expire after 8 hours. Re-authenticate if you get a 401.

---

## Creating a New Route (Bulk)

Create a complete route with all its stops in a single atomic call.

```
POST /admin/routes/bulk
Content-Type: application/json
Authorization: Bearer <token>
```

### Request Body

```json
{
  "route": {
    "city": "Leeds",
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "estimated_duration_mins": 60,
    "estimated_distance_km": 2.5,
    "is_active": true
  },
  "stops": [
    {
      "name": "Leeds Town Hall",
      "directions_from_previous": "Head to The Headrow in the city centre. You'll see a grand building with tall columns.",
      "clue": "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone.",
      "accepted_answers": ["Leeds Town Hall", "Town Hall", "the Town Hall"],
      "hints": [
        "Think civic buildings — this one has Corinthian columns.",
        "It's on The Headrow, opened in 1858 by Queen Victoria."
      ],
      "correct_response": "",
      "fun_fact": "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes.",
      "images": [],
      "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall"
    },
    {
      "name": "Corn Exchange",
      "directions_from_previous": "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right.",
      "clue": "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall.",
      "accepted_answers": ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"],
      "hints": [
        "This building was originally for trading grain.",
        "It has a distinctive oval shape and domed glass roof, built in 1863."
      ],
      "correct_response": "",
      "fun_fact": "The Corn Exchange is another Cuthbert Brodrick design. Its elliptical shape was revolutionary for 1863 and it's now Grade I listed.",
      "images": [],
      "google_maps_link": "https://maps.google.com/?q=Leeds+Corn+Exchange"
    },
    {
      "name": "Leeds Minster",
      "directions_from_previous": "Head east along Kirkgate for about 3 minutes. Look for the church on your left.",
      "clue": "The oldest site of worship here, I've watched this city grow each year. My name was raised from parish church — now 'Minster' puts me a notch above the rest.",
      "accepted_answers": ["Leeds Minster", "the Minster", "Leeds Parish Church"],
      "hints": [
        "It's the oldest religious site in Leeds, on Kirkgate.",
        "It became a Minster in 2012 — before that it was Leeds Parish Church."
      ],
      "correct_response": "",
      "fun_fact": "Leeds Minster stands on a site of Christian worship dating back to the 7th century. The current building is mostly Victorian but the site is over 1,300 years old.",
      "images": [],
      "google_maps_link": "https://maps.google.com/?q=Leeds+Minster"
    }
  ]
}
```

### Response (201 Created)

```json
{
  "route": {
    "id": "uuid",
    "city": "Leeds",
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "total_stops": 3,
    "estimated_duration_mins": 60,
    "estimated_distance_km": 2.5,
    "is_active": true,
    "created_at": "2025-01-15T10:30:00.000Z",
    "updated_at": "2025-01-15T10:30:00.000Z"
  },
  "stops": [
    {
      "id": "uuid",
      "route_id": "uuid",
      "stop_number": 1,
      "name": "Leeds Town Hall",
      "...": "..."
    }
  ]
}
```

---

## Reading Routes

### List All Routes

```
GET /admin/routes
Authorization: Bearer <token>
```

Returns all routes with stop counts. Use this to find route IDs.

### Get Route with All Stops

```
GET /admin/routes/:id
Authorization: Bearer <token>
```

Returns the full route object and an ordered array of all stops. This is the primary read endpoint — use it to understand what currently exists before making edits.

---

## Editing Routes (Individual Endpoints)

### Update Route Metadata

```
PUT /admin/routes/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "city": "Leeds",
  "name": "Updated Route Name",
  "description": "Updated description.",
  "estimated_duration_mins": 75,
  "estimated_distance_km": 3.0,
  "is_active": true
}
```

### Update a Stop

```
PUT /admin/routes/:routeId/stops/:stopId
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Stop Name",
  "directions_from_previous": "Updated directions.",
  "clue": "Updated clue text.",
  "accepted_answers": ["Answer 1", "Answer 2"],
  "hints": ["Hint 1", "Hint 2"],
  "correct_response": "",
  "fun_fact": "Updated fun fact.",
  "images": [],
  "google_maps_link": "https://maps.google.com/?q=..."
}
```

### Add a New Stop

```
POST /admin/routes/:routeId/stops
Content-Type: application/json
Authorization: Bearer <token>
```

Same body as update. The stop is appended to the end (auto-assigned the next stop number).

### Delete a Stop

```
DELETE /admin/routes/:routeId/stops/:stopId
Authorization: Bearer <token>
```

Remaining stops are automatically renumbered.

### Reorder Stops

```
PUT /admin/routes/:routeId/stops/reorder
Content-Type: application/json
Authorization: Bearer <token>

{
  "stop_ids": ["uuid-of-stop-3", "uuid-of-stop-1", "uuid-of-stop-2"]
}
```

All stop IDs for the route must be included. The new order matches the array order.

### Delete a Route

```
DELETE /admin/routes/:id
Authorization: Bearer <token>
```

Fails with 409 if any events are linked to this route.

---

## Message Banks

Message banks are global templates used by the AI guide. You can read them to understand the guide's tone, and create/update them.

### List Message Banks

```
GET /admin/message-banks
GET /admin/message-banks?type=success
Authorization: Bearer <token>
```

### Create Message Bank Entry

```
POST /admin/message-banks
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "success",
  "content": "That's the one.",
  "is_active": true
}
```

Valid types: `success`, `failure`, `hint-exhausted`, `clarification`, `unknown-answer`, `opening`, `completion`, `over-length`

### Update / Delete

```
PUT /admin/message-banks/:id
DELETE /admin/message-banks/:id
```

---

## Field Constraints

### Route Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| city | string | Yes | Min 1 char |
| name | string | Yes | Min 1 char |
| description | string | No | — |
| estimated_duration_mins | number | Yes | Must be > 0 |
| estimated_distance_km | number | Yes | Must be > 0 |
| is_active | boolean | No | Default: true |

### Stop Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | Yes | Min 1 char |
| directions_from_previous | string | No | — |
| clue | string | Yes | Min 1 char |
| accepted_answers | string[] | Yes | Min 1 item, each non-empty |
| hints | string[] | Yes | Min 2, max 3 items, each non-empty |
| correct_response | string | No | — |
| fun_fact | string | No | — |
| images | string[] | No | Default: [] (requires separate upload) |
| google_maps_link | string | No | Must be valid URL if provided |

### Bulk Create Limits

- Minimum 1 stop, maximum 30 stops per route

---

## Error Responses

All errors return:
```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE"
}
```

Common codes:
- `INVALID_CREDENTIALS` (401) — Bad username/password
- `ROUTE_NOT_FOUND` (404) — Route ID doesn't exist
- `STOP_NOT_FOUND` (404) — Stop ID doesn't exist
- `ROUTE_HAS_EVENTS` (409) — Can't delete route with linked events
- Validation errors (400) — Zod validation details in the error message
