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
  "name": "Leeds City Centre Discovery",
  "description": "A walking tour through the historic heart of Leeds.",
  "language": "en",
  "route_family_id": "uuid-of-existing-family",
  "estimated_duration_mins": 60,
  "estimated_distance_km": 2.5,
  "is_active": true
}
```

Or, without a family (auto-creates one from `city`):
```json
{
  "name": "Leeds City Centre Discovery",
  "description": "A walking tour through the historic heart of Leeds.",
  "language": "en",
  "city": "Leeds",
  "estimated_duration_mins": 60,
  "estimated_distance_km": 2.5,
  "is_active": true
}
```

> Either `route_family_id` or `city` must be provided. If `route_family_id` is given, the route is added to that family. If `city` is given without a family ID, a new route family is auto-created.

Response (201 Created):
```json
{
  "route": {
    "id": "uuid",
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "language": "en",
    "route_family_id": "uuid",
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
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "language": "en",
    "route_family_id": "uuid-of-existing-family",
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

The `route` object also accepts `city` instead of `route_family_id` to auto-create a family (same rules as the metadata-only endpoint above).

### Response (201 Created)

```json
{
  "route": {
    "id": "uuid",
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "language": "en",
    "route_family_id": "uuid",
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

### Dry Run (`?dry_run=true`)

```
POST /admin/routes/bulk-groups?dry_run=true
```

Validates a bulk create against the live database without keeping anything. The API runs the **entire** create — schema validation, route family lookup (or creation when only `city` is given), the one-active-route-per-family-and-language check, every insert, and the deferred position constraints — inside a transaction and then rolls it back. The result is therefore exactly what a real run would do right now.

`dry_run` accepts `true`, `1` or a bare `?dry_run`; `false`, `0` or omitting it is a real run. Any other value is `400 INVALID_INPUT` (it is never guessed at).

On success the response is **200** (not 201):

```json
{
  "dry_run": true,
  "valid": true,
  "summary": { "groups": 4, "blocks": 23, "creates_route_family": false },
  "ids_provisional": true,
  "would_create": { "route": { "id": "uuid", "...": "..." }, "groups": ["... same shape as the 201 response ..."] }
}
```

- `would_create` has the same shape as the 201 response. Its ids and timestamps come from the rolled-back inserts (`ids_provisional: true`): they were never committed and a real run assigns new ones, so never reference them.
- `summary.creates_route_family` is `true` when the payload has no `route_family_id`, i.e. a real run would also create a family.
- A failure returns the **same status and code as a real run**: `400 INVALID_INPUT` for schema errors, `404 ROUTE_FAMILY_NOT_FOUND`, `409 DUPLICATE_LANGUAGE_VARIANT` (including when the database unique index catches it), and `403 ADMIN_SCOPE_REQUIRED` for an API key sending `is_active: true` (activation stays human-only even in a dry run).
- It is still a POST: an API key needs `routes:write`, it counts against the key's write rate limit, and it is written to the admin audit log with `params.dry_run = "true"` so it cannot be mistaken for a create.

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

Returns the full route object with an ordered array of groups, each containing an ordered array of blocks. The response also includes `route_family` info alongside `route` and `groups`. This is the primary read endpoint — use it to understand what currently exists before making edits.

---

## Editing Routes

### Update Route Metadata

```
PUT /admin/routes/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Route Name",
  "description": "Updated description.",
  "estimated_duration_mins": 75,
  "estimated_distance_km": 3.0,
  "is_active": true
}
```

> Note: `language` and `route_family_id` are immutable after creation. `city` is now managed on the route family, not the route.

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

With only `name`, the group is appended at the end (auto-assigned next position) and the response includes `blocks: []`.

The body can also carry the group's blocks and where to put it:

```json
{
  "name": "Corn Exchange",
  "position": 2,
  "blocks": [
    { "type": "message", "config": { "type": "message", "content": "Head down Call Lane..." } },
    { "type": "question", "config": { "type": "question", "clue": "...", "accepted_answers": ["1863"], "hints": [[{ "content": "..." }], [{ "content": "..." }]] } }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | Yes | 1-100 chars, trimmed |
| blocks | Block[] | No | 0-50 blocks, each validated exactly like a bulk-create block. Caller `position`s are sort keys; stored positions are always 0..n-1 |
| position | number | No | 0-indexed. Inserts the group there and shifts every later group up by one. A value at or past the end appends |

- The group and all its blocks are created in **one transaction**: an invalid block (`400`) or any failure creates nothing, so no empty group is left behind.
- `total_stops` is updated to the new group count.
- **Live events**: inserting in the middle shifts groups that playable events are walking, so it is refused with `409 GROUP_HAS_LIVE_EVENTS` while any non-finished event exists on the route (the same positional guard as a mid-group block insert). Appending is always allowed; if events are live the response carries the `X-Live-Events: <n>` warning header.

Response (201):

```json
{
  "group": {
    "id": "uuid", "route_id": "uuid", "position": 2, "name": "Corn Exchange",
    "created_at": "...", "updated_at": "...",
    "blocks": [{ "id": "uuid", "group_id": "uuid", "position": 0, "type": "message", "config": { "...": "..." }, "delay_ms": 0, "created_at": "..." }]
  }
}
```

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

## Route Families

Route families group language variants of the same route together. A family has a city and contains one or more routes in different languages.

### List Route Families

```
GET /admin/route-families
Authorization: Bearer <token>
```

Returns all route families with their language variants.

Response:
```json
{
  "route_families": [
    {
      "id": "uuid",
      "name": "Leeds City Centre",
      "city": "Leeds",
      "created_at": "...",
      "updated_at": "...",
      "routes": [
        { "id": "uuid", "language": "en", "name": "Leeds City Centre Discovery", "is_active": true },
        { "id": "uuid", "language": "es", "name": "Descubrimiento del Centro de Leeds", "is_active": true }
      ]
    }
  ]
}
```

### Get Route Family Detail

```
GET /admin/route-families/:id
Authorization: Bearer <token>
```

Returns the family and all its route variants with group counts. Use this to see all language variants and cross-reference when translating.

Response:
```json
{
  "route_family": {
    "id": "uuid",
    "name": "Leeds City Centre",
    "city": "Leeds",
    "created_at": "...",
    "updated_at": "..."
  },
  "routes": [
    {
      "id": "uuid",
      "language": "en",
      "route_family_id": "uuid",
      "name": "Leeds City Centre Discovery",
      "description": "...",
      "total_stops": 4,
      "estimated_duration_mins": 60,
      "estimated_distance_km": 2.5,
      "is_active": true,
      "created_at": "...",
      "updated_at": "...",
      "group_count": 4
    }
  ]
}
```

### Create Route Family

```
POST /admin/route-families
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "Leeds City Centre", "city": "Leeds" }
```

### Update Route Family

```
PUT /admin/route-families/:id
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "Updated Name", "city": "Updated City" }
```

### Delete Route Family

```
DELETE /admin/route-families/:id
Authorization: Bearer <token>
```

Fails with 409 if routes exist in the family.

---

## Message Banks

Message banks are global templates used by the AI guide. You can read them to understand the guide's tone, and create/update them.

### List Message Banks

```
GET /admin/message-banks
GET /admin/message-banks?type=success
GET /admin/message-banks?type=success&language=en
Authorization: Bearer <token>
```

Supports filtering by `type` and `language` query parameters (both optional, combined with AND; an empty value means no filter). `language` must be one of `en`, `es`, `fr`, `de`, `nl`; anything else is `400 INVALID_INPUT` rather than an empty list. `type` is not validated: an unknown type simply matches nothing. API keys need `message-banks:read`.

### Create Message Bank Entry

```
POST /admin/message-banks
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "success",
  "language": "en",
  "content": "That's the one.",
  "is_active": true
}
```

Valid types: `success`, `failure`, `hint-exhausted`, `hint-offer`, `hint-decline`, `clarification`, `unknown-answer`, `completion`, `over-length`, `guide-degraded`, `guide-busy`

> Message banks are filtered by language at runtime so the AI guide uses messages matching the route's language.

### Update / Delete

```
PUT /admin/message-banks/:id
DELETE /admin/message-banks/:id
```

---

## Image Uploads

An `image_url` (on `image` blocks and hint `SequenceItem`s) must be either an absolute `http(s)://` URL or an `{{IMAGE:slug}}` placeholder (slug: lowercase letters, digits and single hyphens, no leading/trailing hyphen, max 100 chars — see [content-guide.md](content-guide.md#image-urls)). Anything else is rejected with `400`.

### Placeholders and the `route-images/` key

A placeholder is stored as written and resolved by the API every time a message reaches a player:

| Stored `image_url` | Sent to the player as |
|---|---|
| `{{IMAGE:leeds-town-hall-facade}}` | `${AWS_CDN_BASE_URL}/route-images/leeds-town-hall-facade.jpg` |
| `https://…` | unchanged |
| malformed `{{…}}` (legacy rows only) | `null` (no image) |

So for a slug to resolve, a JPEG must exist in the bucket at exactly **`route-images/<slug>.jpg`**. Upload it with `POST /admin/upload` and a `slug` (below), which presigns exactly that key. Staging and production use separate buckets, so a slug must be uploaded in each environment it is used in. Uploading to an existing slug replaces the photo for every block, hint and language that uses it; the CDN may serve the old photo until its cache expires.

If the object is missing, the player app shows a neutral placeholder tile instead of a broken image.

To check where a slug resolves in the current environment, and whether a photo is already uploaded there:

```
GET /admin/route-images/leeds-town-hall-facade
Authorization: Bearer <token>
```

```json
{
  "slug": "leeds-town-hall-facade",
  "key": "route-images/leeds-town-hall-facade.jpg",
  "placeholder": "{{IMAGE:leeds-town-hall-facade}}",
  "url": "https://cdn.yourdomain.com/route-images/leeds-town-hall-facade.jpg",
  "exists": true,
  "size": 482113,
  "last_modified": "2026-09-01T10:00:00.000Z"
}
```

`url` is `null` when no `AWS_CDN_BASE_URL` is configured. A malformed slug returns `400`. `exists` comes from an S3 `HeadObject` on `key`; `size` (bytes) and `last_modified` are `null` unless it exists. `exists` is `null` when the check itself failed (bucket unreachable or missing permission): treat `null` as "may exist", never as "free to overwrite". Before a slug upload, check this and only overwrite an existing photo deliberately.

To list every slug photo uploaded in the current environment:

```
GET /admin/route-images
Authorization: Bearer <token>
```

```json
{
  "images": [
    {
      "slug": "corn-exchange-dome",
      "key": "route-images/corn-exchange-dome.jpg",
      "size": 391022,
      "last_modified": "2026-09-01T10:00:00.000Z",
      "url": "https://cdn.yourdomain.com/route-images/corn-exchange-dome.jpg"
    }
  ],
  "truncated": false
}
```

- Sorted by slug. Only objects named `route-images/<valid-slug>.jpg` are listed; anything else under the prefix is skipped because no placeholder can reach it.
- The API pages through S3 itself (`ListObjectsV2`) up to 5000 objects; `truncated: true` means it stopped at that cap.
- `url` is `null` when no CDN is configured. An S3 failure is a `500`.
- Staging and production have separate buckets: the list only shows this environment's photos.

Both route-image endpoints need `images:read` for API keys. The API's IAM user needs `s3:ListBucket` on the bucket for the listing (and so that `HeadObject` on a missing key returns 404 rather than 403), in addition to `s3:GetObject` and `s3:PutObject` on its objects.

### Get a Pre-signed Upload URL

```
POST /admin/upload
Content-Type: application/json
Authorization: Bearer <token>
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| filename | string | Yes | Used for the key of one-off uploads; ignored (but still required) with `slug` |
| content_type | string | Yes | `image/jpeg` or `image/png`; must be `image/jpeg` with `slug` |
| slug | string | No | Placeholder slug. When present the upload targets `route-images/<slug>.jpg` |

**Slug upload** (fills a `{{IMAGE:slug}}` placeholder — the usual path for programmatically authored routes):

```json
{ "filename": "town-hall.jpg", "content_type": "image/jpeg", "slug": "leeds-town-hall-facade" }
```

```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "key": "route-images/leeds-town-hall-facade.jpg",
  "url": "https://cdn.yourdomain.com/route-images/leeds-town-hall-facade.jpg",
  "slug": "leeds-town-hall-facade",
  "placeholder": "{{IMAGE:leeds-town-hall-facade}}"
}
```

`url` is `null` when no `AWS_CDN_BASE_URL` is configured, the same as `GET /admin/route-images/:slug`.

Then `PUT` the raw JPEG bytes to `upload_url` with header `Content-Type: image/jpeg`. Nothing in the route needs editing: the blocks keep `placeholder` as their `image_url` and resolve to `url` automatically. Use `placeholder` as the `image_url` for any new block that should show the same photo.

**One-off upload** (no `slug`):

```json
{ "filename": "leeds-town-hall.jpg", "content_type": "image/jpeg" }
```

```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "key": "uploads/1705312200000_leeds-town-hall.jpg",
  "url": "https://cdn.yourdomain.com/uploads/1705312200000_leeds-town-hall.jpg"
}
```

Then `PUT` the raw image bytes to `upload_url` with the same `Content-Type`. Put `url` — the absolute public URL — in the block's `image_url` (this replaces a placeholder for that block only); `key` is the raw S3 object path and a browser would resolve it against whatever page it is rendered on.

The pre-signed URL expires after 5 minutes.

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

> The `route_family_id` and `language` are automatically derived from the route.

Response (201 Created):
```json
{
  "event": {
    "id": "uuid",
    "code": "abc12def",
    "status": "NOT_STARTED",
    "route_id": "uuid",
    "route_family_id": "uuid",
    "language": "en",
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
| name | string | Yes | Min 1 char, trimmed |
| description | string | No | Trimmed |
| language | string | No | Default: `"en"`. One of: `en`, `es`, `fr`, `de`, `nl` |
| route_family_id | string (UUID) | No | Must reference an existing route family |
| city | string | No | Min 1 char, trimmed. Used to auto-create a route family |
| estimated_duration_mins | number | Yes | Must be > 0 |
| estimated_distance_km | number | Yes | Must be > 0 |
| is_active | boolean | No | Default: true |

> Either `route_family_id` or `city` is required when creating a route.

`total_stops` is read-only — automatically set to the number of groups. Do not include it in request bodies.

### Group Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | Yes | Min 1 char, max 100 chars, trimmed |
| blocks | Block[] | Bulk: yes; single create: no | Max 50 per group (bulk also needs at least 1) |
| position | number | No (single create only) | 0-indexed insert position, clamped to the end |

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
| image_url | string | Yes | Absolute `http(s)` URL, or `{{IMAGE:slug}}` placeholder (see Image Uploads) |

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
| image_url | string or null | No | Absolute `http(s)` URL, `{{IMAGE:slug}}` placeholder, or null |
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
- `ROUTE_FAMILY_NOT_FOUND` (404) — Route family ID doesn't exist
- `FAMILY_HAS_ROUTES` (409) — Can't delete family with existing routes
- `ROUTE_HAS_EVENTS` (409) — Can't delete route with linked events
- `DUPLICATE_LANGUAGE_VARIANT` (409) — The family already has an active route in this language
- `GROUP_HAS_LIVE_EVENTS` / `BLOCK_HAS_LIVE_EVENTS` (409) — A positional change (delete, move, mid-group block insert, mid-route group insert) while events are still playing
- `ADMIN_SCOPE_REQUIRED` (403) — API key lacks the scope, or tried to create or activate an active route
- `DUPLICATE_GROUP_IDS` (400) — Reorder array has duplicate IDs
- `INCOMPLETE_GROUP_LIST` (400) — Reorder array missing group IDs
- `DUPLICATE_BLOCK_IDS` (400) — Reorder array has duplicate IDs
- `INCOMPLETE_BLOCK_LIST` (400) — Reorder array missing block IDs
- Validation errors (400) — Zod validation details in the error message
