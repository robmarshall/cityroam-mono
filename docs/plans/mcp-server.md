# City Roam route-authoring MCP server

Status: approved design (owner decisions 2026-09-23). Phase 0 of the build order below.

## Goal

Let an LLM client (Claude Code, Claude Desktop) author and edit treasure hunt
routes against a real City Roam environment through a Model Context Protocol
server, without giving it database access or the admin password, and without
letting it do anything a human admin would not sign off on (selling a route,
touching events, refunds).

## Architecture

```
Claude Code / Desktop ──stdio──> packages/mcp (MCP server, Node)
                                      │  HTTPS, Authorization: Bearer crk_stg_…
                                      ▼
                                packages/api admin HTTP API (Hono)
                                      │  Zod validation, integrity checks,
                                      │  live-event guards, scope checks
                                      ▼
                                Postgres / S3
```

- New workspace **`packages/mcp`**: a stdio MCP server built on
  `@modelcontextprotocol/sdk` `^1.29` (stable v1 line). It is a thin client of
  the existing admin HTTP API — it never talks to the database. Every write
  therefore goes through the same Zod schemas, integrity checks
  (`assertFamilyExists`, `activeVariantExists`, dense positions) and live-event
  guards the admin panel uses.
- It authenticates with a **scoped, revocable admin API key** (below), not the
  admin session JWT.
- **Inputs**: MCP `inputSchema`s are transform-free wire shapes (plain JSON
  Schema generated from Zod objects without `preprocess`/`transform`/`default`
  side effects, because MCP clients render and validate them literally).
  Handlers re-parse the arguments with the real shared schemas from
  `@cityroam/shared/validation` (`routeSchema`, `routeBlockSchema`,
  `bulkRouteGroupCreateSchema`, …) before calling the API, so a malformed
  payload fails locally with the same message the API would give.
- **Environment pinning**: `CITYROAM_ENV` defaults to `staging`. Production
  requires both `CITYROAM_ENV=production` and `CITYROAM_ALLOW_PRODUCTION=1`;
  otherwise the server refuses to start. The key prefix (`crk_stg_` /
  `crk_prd_`) must match the pinned environment — checked locally at startup
  and again by the API (`API_KEY_ENV`). Every tool result is prefixed with
  `[staging]` or `[PRODUCTION]` so the transcript always shows where a write
  landed.
- Config via env: `CITYROAM_API_URL`, `CITYROAM_API_KEY`, `CITYROAM_ENV`,
  `CITYROAM_ALLOW_PRODUCTION`, `CITYROAM_IMAGE_ROOTS` (path-delimited list of
  directories `upload_image` may read from).
- Staging and production have **separate S3 buckets**, so images uploaded
  while authoring on staging must be re-uploaded on production (the
  `{{IMAGE:slug}}` placeholder keeps block content identical across both).

## Tools

All write tools accept `dry_run` (validate + show the exact request, send
nothing — or, where the API supports it, ask the API to validate and roll
back). Edits that touch a route with `is_active = true` require
`confirm_live: true`. Deletes require `confirm: true`.

| Tool | Scope | Notes |
|---|---|---|
| `list_route_families` | routes:read | `GET /admin/route-families` |
| `get_route_family` | routes:read | `GET /admin/route-families/:id` |
| `list_routes` | routes:read | `GET /admin/routes`, optional family/language/active filters applied client-side |
| `get_route` | routes:read | `GET /admin/routes/:id`; `format: "tree"` (full configs) or `"compact"` (one line per block, for large routes) |
| `list_message_banks` | message-banks:read | `GET /admin/message-banks?type=&language=` (language filter is a Phase 4 API gap) |
| `list_image_slugs` | images:read | `GET /admin/route-images` (Phase 4 API gap) |
| `validate_route` | routes:read | Local lint (Phase 5b): shared Zod schemas + content-guide rules (hint counts, answer variants, image refs resolve, map links, delay limits). With a route id, lints the stored route; with a payload, lints before creation. Optionally calls bulk-groups `?dry_run=true`. |
| `create_route` | routes:write | `POST /admin/routes/bulk-groups`; `is_active` is **forced false** — activation is human-only |
| `update_route` | routes:write | GET-merge-PUT on `PUT /admin/routes/:id` (the endpoint takes the full `routeSchema`); cannot activate |
| `add_group` | routes:write | `POST /admin/routes/:id/groups` with optional `blocks` + `position` (Phase 4) |
| `update_group` | routes:write | rename |
| `delete_group` | routes:write | `confirm` required |
| `add_block` | routes:write | optional `position` |
| `update_block` | routes:write | full replace, or `patch_config` (deep-merge into the current config after a GET, then re-validated) |
| `move_block` | routes:write | `PUT /admin/blocks/:id/move` |
| `delete_block` | routes:write | `confirm` required |
| `reorder_groups` | routes:write | full id list |
| `reorder_blocks` | routes:write | full id list |
| `upload_image` | images:write | Source is a local path inside `CITYROAM_IMAGE_ROOTS` (resolved with `realpath`, no traversal/symlink escape) or an http(s) URL. Magic-byte sniffing (JPEG/PNG), ≤ 5 MB. Slug mode (`{{IMAGE:slug}}`) is JPEG only. Overwrite protection: an existing slug needs `overwrite: true`. Flow: `POST /admin/upload` → PUT to the presigned URL. |
| `create_message_bank_entry` | message-banks:write | |
| `update_message_bank_entry` | message-banks:write | |

**Excluded on purpose**: route and route-family deletion, route activation,
events, refunds, email resends, dashboard, API key management. These stay in
the admin panel behind a human session.

### Resources

- `docs/llm-authoring/*.md` (api-reference, content-guide, data-model,
  guide-personality, translation-guide) exposed as
  `cityroam://docs/<name>`, bundled at build time so the server works outside
  the repo.
- `cityroam://routes/{id}` — resource template returning the compact route
  tree.

### Prompts

- `author_route` — walks the model through the four authoring docs, a draft,
  `validate_route`, then `create_route` (inactive).
- `translate_route` — loads a source route, follows `translation-guide.md`,
  creates an inactive sibling variant in the same family.

## Authentication: admin API keys

### Token format

```
crk_<env>_<keyIdBase62>_<secret>
```

- `env` ∈ `dev | stg | prd`. The API refuses any key whose env segment differs
  from its own `API_KEY_ENV` (new env var: defaults to `dev` in development;
  outside development it is required and must be `stg` or `prd`, set per
  deployment). A staging key pasted into a production config fails closed.
- `keyIdBase62` — the row's UUID (128 bits) encoded base62 (22 chars). Used
  for lookup, so verification is one indexed read.
- `secret` — 32 random bytes, base64url (43 chars).

### Storage

Table `admin_api_keys`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | encoded into the token |
| `name` | varchar(100) | human label |
| `prefix` | varchar | `crk_<env>_<keyId>` — shown in lists |
| `token_hash` | char(64) unique | `sha256(secret)` hex |
| `last4` | char(4) | last four chars of the secret, for recognition |
| `scopes` | text[] | subset of `ADMIN_API_KEY_SCOPES` |
| `created_by` | varchar | admin username |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz null | 30/90/365 days or never |
| `last_used_at` / `last_used_ip` | | updated only when > 5 min stale |
| `revoked_at` / `revoked_by` | | soft revoke; revoked keys are never deleted |

The secret has 256 bits of entropy, so a plain SHA-256 is sufficient (no
bcrypt/argon — there is nothing to brute-force). Verification looks the row up
by id and compares hashes with the existing `constantTimeEquals` /
`timingSafeEqual` pattern. The full token is shown **once** at creation.

Unknown id, wrong secret, revoked, expired and wrong env all return the same
`401 ADMIN_UNAUTHORIZED` body, so the response does not reveal whether a key
id exists.

### Scopes

Defined in `@cityroam/shared/constants` as `ADMIN_API_KEY_SCOPES`:

- `routes:read` — route families, routes, groups, blocks
- `routes:write` — create/edit route metadata, families, groups, blocks (not activation)
- `routes:publish` — activation. **Owner decision: activation is human-only.**
  The constant exists for the server-side check, but `adminApiKeyCreateSchema`
  rejects it, so no key can ever hold it.
- `images:read`, `images:write`
- `message-banks:read`, `message-banks:write`

A session JWT carries every scope plus access to session-only routes.

### Middleware

`requireAdmin(scope?: Scope | "session-only")` replaces `adminAuth`
(`export const adminAuth = requireAdmin("session-only")` stays as an alias).

- `Authorization: Bearer crk_…` → API-key verification; anything else → JWT
  verification as today.
- Sets `c.set("admin", { kind: "session" | "api_key", username?, keyId?, keyName?, scopes })`.
- Missing scope → `403 ADMIN_SCOPE_REQUIRED` (message names the scope).
- API key on a session-only route → `403 ADMIN_SESSION_REQUIRED`.
- Invalid / revoked / expired / wrong-env key → `401 ADMIN_UNAUTHORIZED`.

Route annotations in `routes/admin.ts`:

| Routes | Requirement |
|---|---|
| GET route-families, routes, route detail | routes:read |
| POST/PUT route-families, POST/PUT routes, bulk-groups, group + block create/update/reorder/move/delete | routes:write |
| GET message-banks | message-banks:read |
| POST/PUT message-banks | message-banks:write |
| POST /admin/upload | images:write |
| GET /admin/route-images/:slug | images:read |
| DELETE routes, DELETE route-families, DELETE message-banks | session-only (destructive, excluded from the MCP tool list — defence in depth) |
| events, dashboard, refunds, resend, and everything else | session-only |

### Activation guard

`assertCanActivate(c, wasActive, willBeActive)` runs in `POST /admin/routes`,
`POST /admin/routes/bulk-groups` and `PUT /admin/routes/:id`. For an API-key
caller without `routes:publish` (i.e. every key), creating an active route or
flipping `is_active` false → true is `403 ADMIN_SCOPE_REQUIRED`. Keeping an
already-active route active in a PUT is allowed (renames/copy edits on a live
route). Note `routeSchema.is_active` defaults to `true`, so API-key callers
must send `is_active: false` explicitly — the MCP server always does.

### CSRF and CORS

`csrfGuard` is mounted only on the cookie-authenticated `/event/*` mutation
routes. Admin routes authenticate with a bearer header that browsers never
attach automatically, so they are not CSRF-exposed and the MCP server's
`Origin`-less requests pass. A regression test pins both facts. CORS already
allows the `Authorization` header; `X-Live-Events` is added to
`exposeHeaders`.

### Live content edits: warn only

**Owner decision**: content edits on a route with live (non-terminal) events
are performed, but the response carries `X-Live-Events: <n>`. Applies to
`PUT /admin/blocks/:blockId` and group rename. Structural changes that shift
positions (reorder, move, delete, mid-group insert) keep their existing 409
guards. Group reorder has no guard today — it only changes the order of
groups not yet reached/already passed and doesn't shift `current_block_index`,
so it gets the warning header too. The MCP server surfaces the header as a
warning in the tool result; the admin UI is unaffected.

## Rate limits (Phase 2)

- Per key: 300 reads/min, 60 writes/min (Redis fixed window, same helpers as
  the login limiter). 429 with `Retry-After`.
- Invalid-key attempts: 20 per 15 min per IP, counted before verification of
  anything that parses as `crk_…`.
- Fail open on Redis errors, like the login limiter — Redis being down must
  not lock the owner out of the admin API.

## Audit log (Phase 2)

As built (migration 0013): table `admin_audit_log` with `id`, `created_at`,
`actor_type` (session/api_key), `actor_id` (username or key id),
`actor_name` (username or key name), `method`, `path` (query string, event
codes and `crk_` tokens scrubbed), `params jsonb` (route params, credential-like
names redacted), `status`, `ip`, `request_id`; index `(actor_id, created_at)`.
No request bodies are stored. `requireAdmin` writes a row after the handler
for every non-GET request by an authenticated caller — sessions and keys
alike — whose status is below 500, including 4xx refusals (403 scope/session
rejections too). Requests refused by the per-key rate limit are not audited
(a runaway client would otherwise turn each rejection into a write), and a
failed audit write never fails the request. Read via session-only
`GET /admin/audit-log?actor_id=&limit=&offset=`; shown per key on the
ApiKeysPage. Pruned after 180 days by the data-retention sweep.

## API gaps (Phase 4)

**Done.** As built:

1. `GET /admin/message-banks?language=` filters by language (AND with
   `type`; empty values mean no filter). `language` is validated against
   `SUPPORTED_LANGUAGES` by the shared `messageBankListQuerySchema`, so an
   unsupported code is `400 INVALID_INPUT` instead of an empty list.
2. `POST /admin/routes/bulk-groups?dry_run=true` (also `1` or bare
   `?dry_run`; any value other than true/1/false/0 is a 400) runs the
   identical transaction — family lookup/creation, active-variant check,
   every insert, then `SET CONSTRAINTS ALL IMMEDIATE` so the deferred
   position uniques are checked too — and rolls it back by throwing a
   sentinel. 200 with `{ dry_run, valid, summary: { groups, blocks,
   creates_route_family }, ids_provisional: true, would_create }`, where
   `would_create` is the real 201 shape with ids from the rolled-back
   inserts. Failures return the real run's codes. `assertCanActivate` runs
   first, so an API key cannot dry-run an active route. **Audit decision**:
   a dry run is still audited (it is a POST and counts as a write for the
   rate limit), tagged `params.dry_run = "true"` via the `auditDryRun`
   context flag, because the stored path drops the query string.
3. `POST /admin/routes/:id/groups` takes the shared `groupCreateSchema`:
   `name`, optional `blocks` (0–50, each `routeBlockSchema`, caller positions
   are sort keys) and optional `position` (clamped to the end). Group and
   blocks are one transaction. A mid-route insert shifts later groups with
   one CASE update (safe under the deferred unique) and is refused with
   `409 GROUP_HAS_LIVE_EVENTS` while any non-terminal event exists on the
   route — positional guards stay. An append only sets `X-Live-Events`.
   Name-only bodies behave exactly as before.
4. `GET /admin/route-images` (images:read) lists `route-images/<slug>.jpg`
   via `ListObjectsV2`, paginating up to 5000 objects
   (`{ images: [{slug, key, size, last_modified, url}], truncated }`, sorted
   by slug, non-slug keys skipped). `GET /admin/route-images/:slug` adds
   `exists`, `size`, `last_modified` from `HeadObject`. **Deviation**:
   `exists` is `boolean | null` — null when the check itself fails, so the
   admin preview keeps working without S3 read access; MCP overwrite
   protection must treat null as "may exist".
5. The slug-upload response `url` is now null when no CDN is configured, the
   same rule as `GET /admin/route-images/:slug` (one-off uploads still
   return a string, since the admin stores it on the block).

**Launch checklist**: the API's IAM user needs `s3:ListBucket` on each
bucket (staging and production) for the listing — and without it S3 answers
`HeadObject` on a missing key with 403, which reports `exists: null`.

## Build order

1. **Keys core** — shared scopes + create schema, `admin_api_keys` table and
   migration, `lib/api-keys.ts`, `requireAdmin`, `API_KEY_ENV`, route
   annotations, `assertCanActivate`, `X-Live-Events`, tests.
2. **Rate limit + audit** — per-key and invalid-key limiters, audit table and
   writer.
3. **Key endpoints + admin ApiKeysPage** — session-only
   `GET/POST /admin/api-keys`, `POST /admin/api-keys/:id/revoke`; admin UI
   with explicit Save/Create buttons (never autosave), token shown once with
   copy button, scope checkboxes (no publish), expiry select.
4. **API gaps** — the items above. **Done.**
5a. **MCP skeleton + read tools** — `packages/mcp`, env pinning, API client,
   resources, read tools.
5b. **Lint / `validate_route`**.
6. **Write tools** — dry_run, confirm_live, confirm, GET-merge-PUT, patch_config.
7. **Images + message banks** — `upload_image`, `list_image_slugs`, message
   bank tools. **Done** (`registerImageTools` / `registerMessageBankTools`;
   wired into `server.ts` in Phase 8, which must pass `{ fetchImpl }` to
   `registerImageTools` for the presigned PUT and URL downloads).
8. **Docs/config** — `.mcp.json.example`, Claude Desktop snippet, CLAUDE.md
   note, key rotation runbook.
