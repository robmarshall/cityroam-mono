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

## Creating a Route (Metadata Only)

Create a route without any groups. Useful when building routes incrementally — add groups and blocks afterwards.

```
POST /admin/routes
Content-Type: application/json
Authorization: Bearer <token>

{
  "city": "Leeds",
  "name": "Leeds City Centre Discovery",
  "description": "A walking tour through the historic heart of Leeds.",
  "estimated_duration_mins": 60,
  "estimated_distance_km": 2.5,
  "is_active": true
}
```

Response (201 Created):
```json
{
  "route": {
    "id": "uuid",
    "city": "Leeds",
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "total_stops": 0,
    "estimated_duration_mins": 60,
    "estimated_distance_km": 2.5,
    "is_active": true,
    "created_at": "2025-01-15T10:30:00.000Z",
    "updated_at": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## Creating a New Route (Bulk)

Create a complete route with all its groups and blocks in a single atomic call.

```
POST /admin/routes/bulk-groups
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
  "groups": [
    {
      "name": "Introduction",
      "blocks": [
        {
          "type": "message",
          "config": { "type": "message", "content": "Welcome to {{CITY_NAME}}. I'll be your guide today." },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Head to The Headrow in the city centre. You'll see a grand building with tall columns." },
          "delay_ms": 2000
        }
      ]
    },
    {
      "name": "Leeds Town Hall",
      "blocks": [
        {
          "type": "question",
          "config": {
            "type": "question",
            "clue": "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone.",
            "accepted_answers": ["Leeds Town Hall", "Town Hall", "the Town Hall"],
            "hints": [
              [{ "content": "Think civic buildings — this one has Corinthian columns.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "It's on The Headrow, opened in 1858 by Queen Victoria.", "image_url": null, "delay_ms": 0 }]
            ]
          },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes." },
          "delay_ms": 1500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right." },
          "delay_ms": 2000
        }
      ]
    },
    {
      "name": "Corn Exchange",
      "blocks": [
        {
          "type": "question",
          "config": {
            "type": "question",
            "clue": "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall.",
            "accepted_answers": ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"],
            "hints": [
              [{ "content": "This building was originally for trading grain.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "It has a distinctive oval shape and domed glass roof, built in 1863.", "image_url": null, "delay_ms": 0 }]
            ]
          },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "The Corn Exchange is another Cuthbert Brodrick design. Its elliptical shape was revolutionary for 1863 and it's now Grade I listed." },
          "delay_ms": 1500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Head east along Kirkgate for about 3 minutes. Look for the church on your left." },
          "delay_ms": 2000
        }
      ]
    },
    {
      "name": "Leeds Minster",
      "blocks": [
        {
          "type": "question",
          "config": {
            "type": "question",
            "clue": "The oldest site of worship here, I've watched this city grow each year. My name was raised from parish church — now 'Minster' puts me a notch above the rest.",
            "accepted_answers": ["Leeds Minster", "the Minster", "Leeds Parish Church"],
            "hints": [
              [{ "content": "It's the oldest religious site in Leeds, on Kirkgate.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "It became a Minster in 2012 — before that it was Leeds Parish Church.", "image_url": null, "delay_ms": 0 }]
            ]
          },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Leeds Minster stands on a site of Christian worship dating back to the 7th century. The current building is mostly Victorian but the site is over 1,300 years old." },
          "delay_ms": 1500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Minster" },
          "delay_ms": 500
        }
      ]
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
    "total_stops": 4,
    "estimated_duration_mins": 60,
    "estimated_distance_km": 2.5,
    "is_active": true,
    "created_at": "2025-01-15T10:30:00.000Z",
    "updated_at": "2025-01-15T10:30:00.000Z"
  },
  "groups": [
    {
      "id": "uuid",
      "route_id": "uuid",
      "position": 0,
      "name": "Introduction",
      "created_at": "2025-01-15T10:30:00.000Z",
      "updated_at": "2025-01-15T10:30:00.000Z",
      "blocks": [
        {
          "id": "uuid",
          "group_id": "uuid",
          "position": 0,
          "type": "message",
          "config": { "type": "message", "content": "Welcome to {{CITY_NAME}}. I'll be your guide today." },
          "delay_ms": 0,
          "created_at": "2025-01-15T10:30:00.000Z"
        }
      ]
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

Returns all routes with group counts. Use this to find route IDs.

### Get Route with All Groups and Blocks

```
GET /admin/routes/:id
Authorization: Bearer <token>
```

Returns the full route object with an ordered array of groups, each containing an ordered array of blocks. This is the primary read endpoint — use it to understand what currently exists before making edits.

---

## Editing Routes

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

### Delete a Route

```
DELETE /admin/routes/:id
Authorization: Bearer <token>
```

Fails with 409 if any events are linked to this route. Cascade-deletes all groups and blocks.

---

## Group Management

### Create a Group

```
POST /admin/routes/:id/groups
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "New Location" }
```

The group is appended at the end (auto-assigned next position). Response includes `blocks: []`.

### Update a Group

```
PUT /admin/routes/:id/groups/:groupId
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "Renamed Location" }
```

Only the group name can be updated.

### Delete a Group

```
DELETE /admin/routes/:id/groups/:groupId
Authorization: Bearer <token>
```

Cascade-deletes all blocks within the group. Remaining groups are automatically renumbered.

### Reorder Groups

```
PUT /admin/routes/:id/groups/reorder
Content-Type: application/json
Authorization: Bearer <token>

{
  "group_ids": ["uuid-of-group-3", "uuid-of-group-1", "uuid-of-group-2"]
}
```

All group IDs for the route must be included. The new order matches the array order (first item gets position 0, second gets position 1, etc.).

---

## Block Management

### Create a Block

```
POST /admin/groups/:groupId/blocks
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "message",
  "config": { "type": "message", "content": "Head north along the high street." },
  "delay_ms": 2000
}
```

The block is appended at the end of the group (auto-assigned next position).

### Update a Block

```
PUT /admin/blocks/:blockId
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "question",
  "config": {
    "type": "question",
    "clue": "Updated clue text.",
    "accepted_answers": ["Answer 1", "Answer 2"],
    "hints": [
      [{ "content": "Hint 1", "image_url": null, "delay_ms": 0 }],
      [{ "content": "Hint 2", "image_url": null, "delay_ms": 0 }]
    ]
  },
  "delay_ms": 0
}
```

Updates type, config, and delay_ms.

### Delete a Block

```
DELETE /admin/blocks/:blockId
Authorization: Bearer <token>
```

Remaining blocks in the group are automatically renumbered.

### Reorder Blocks

```
PUT /admin/groups/:groupId/blocks/reorder
Content-Type: application/json
Authorization: Bearer <token>

{
  "block_ids": ["uuid-of-block-3", "uuid-of-block-1", "uuid-of-block-2"]
}
```

All block IDs for the group must be included. The new order matches the array order.

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

Valid types: `success`, `failure`, `hint-exhausted`, `clarification`, `unknown-answer`, `completion`, `over-length`

### Update / Delete

```
PUT /admin/message-banks/:id
DELETE /admin/message-banks/:id
```

---

## Image Uploads

To use images in `image` blocks, you need a publicly accessible URL. You can upload images via the admin API to get a hosted URL.

### Get a Pre-signed Upload URL

```
POST /admin/upload
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "leeds-town-hall.jpg",
  "content_type": "image/jpeg"
}
```

Response:
```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "key": "uploads/1705312200000_leeds-town-hall.jpg"
}
```

Then `PUT` the raw image bytes to `upload_url`. The `key` is the S3 object path — use it to construct the public URL for your image block config.

**Constraints:**
- Allowed types: `image/jpeg`, `image/png`
- Max size: 5MB

---

## Creating a Free Event

Events are usually created automatically via Stripe checkout. Use this endpoint to create free or test events without payment.

```
POST /admin/events
Content-Type: application/json
Authorization: Bearer <token>

{
  "route_id": "uuid-of-existing-route",
  "buyer_email": "test@example.com",
  "expires_in_days": 30
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| route_id | string (UUID) | Yes | Must reference an existing route |
| buyer_email | string | No | Must be valid email if provided |
| expires_in_days | number | No | 1-365, defaults to 90 |

Response (201 Created):
```json
{
  "event": {
    "id": "uuid",
    "code": "abc12def",
    "status": "NOT_STARTED",
    "route_id": "uuid",
    "buyer_email": "test@example.com",
    "expires_at": "2025-04-15T10:30:00.000Z",
    "created_at": "2025-01-15T10:30:00.000Z"
  }
}
```

The 8-character `code` is what players use to join the event.

---

## Field Constraints

### Route Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| city | string | Yes | Min 1 char, trimmed |
| name | string | Yes | Min 1 char, trimmed |
| description | string | No | Trimmed |
| estimated_duration_mins | number | Yes | Must be > 0 |
| estimated_distance_km | number | Yes | Must be > 0 |
| is_active | boolean | No | Default: true |

`total_stops` is read-only — automatically set to the number of groups. Do not include it in request bodies.

### Group Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | Yes | Min 1 char, max 100 chars, trimmed |

### Block Fields (Common)

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| position | number | No | 0-indexed integer. Defaults to array index if omitted. |
| type | string | Yes | One of: `message`, `image`, `question`, `action`, `map` |
| config | object | Yes | Must match type (see below) |
| delay_ms | number | No | 0-300000ms (5 minutes max), default: 0 |

### Block Config — By Type

**message:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| type | `"message"` | Yes | Must be `"message"` |
| content | string | Yes | Min 1 char, trimmed |

**image:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| type | `"image"` | Yes | Must be `"image"` |
| image_url | string | Yes | Must be valid URL |

**question:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| type | `"question"` | Yes | Must be `"question"` |
| clue | string | Yes | Min 1 char, trimmed |
| accepted_answers | string[] | Yes | Min 1 item, each non-empty and trimmed |
| hints | SequenceItem[][] | Yes | 2-3 hint arrays |

Each `SequenceItem`:

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| content | string | Yes | The hint text |
| image_url | string or null | No | Valid URL or null |
| delay_ms | number | No | 0-10000ms, default: 0 |

**action:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| type | `"action"` | Yes | Must be `"action"` |
| label | string | Yes | Min 1 char, trimmed |

**map:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| type | `"map"` | Yes | Must be `"map"` |
| google_maps_link | string | Yes | Must be valid URL |

### Bulk Create Limits

- Minimum 1 group, maximum 30 groups per route
- Minimum 1 block, maximum 50 blocks per group

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
- `GROUP_NOT_FOUND` (404) — Group ID doesn't exist
- `BLOCK_NOT_FOUND` (404) — Block ID doesn't exist
- `ROUTE_HAS_EVENTS` (409) — Can't delete route with linked events
- `DUPLICATE_GROUP_IDS` (400) — Reorder array has duplicate IDs
- `INCOMPLETE_GROUP_LIST` (400) — Reorder array missing group IDs
- `DUPLICATE_BLOCK_IDS` (400) — Reorder array has duplicate IDs
- `INCOMPLETE_BLOCK_LIST` (400) — Reorder array missing block IDs
- Validation errors (400) — Zod validation details in the error message
