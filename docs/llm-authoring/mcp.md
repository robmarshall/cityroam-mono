# City Roam MCP server

`packages/mcp` is a stdio [Model Context Protocol](https://modelcontextprotocol.io) server that lets an LLM client (Claude Code, Claude Desktop) author and edit treasure hunt routes against one City Roam environment. It is a thin client of the admin HTTP API: it never touches the database, authenticates with a scoped admin API key, and every write goes through the same validation, integrity checks and live-event guards as the admin panel.

What it cannot do, by design: activate a route, delete a route or route family, delete message bank entries, or touch events, refunds, emails, the dashboard or API keys. Those stay in the admin panel behind a human login.

---

## Setup

### 1. Create an API key

1. Log into the admin panel for the environment you want (staging first).
2. Go to **Settings → API Keys**, enter a name (e.g. `MCP – Robert laptop`), tick the scopes and pick an expiry (30, 90, 365 days or never), then press **Create**.
3. Copy the token (`crk_stg_…`). It is shown **once**; if you lose it, revoke the key and create a new one.

Scopes the MCP server uses:

| Scope | Needed for |
|---|---|
| `routes:read` | `list_route_families`, `get_route_family`, `get_route_facts`, `list_routes`, `get_route`, `validate_route`, the route resource, and the route lookups inside every write tool |
| `routes:write` | `create_route`, `update_route`, `update_route_facts`, group and block tools |
| `images:read` | `list_image_slugs`, and the overwrite check in `upload_image` |
| `images:write` | `upload_image` |
| `message-banks:read` | `list_message_banks` |
| `message-banks:write` | `create_message_bank_entry`, `update_message_bank_entry` |

`routes:publish` (activation) is never offered and the API refuses it: **a human always activates a route in the admin UI.** Give a key only the scopes it needs, e.g. read-only scopes for a reviewing session.

Each deployment only accepts keys for its own environment (`API_KEY_ENV`: `crk_dev_` locally, `crk_stg_` on staging, `crk_prd_` on production).

Rotation: create the new key, update your client config, restart the client, then **Revoke** the old key on the API Keys page. The page shows each key's last use and its audit log.

### 2. Configure your client

The server runs from source through `tsx` (the shared package ships TypeScript), so it needs this repo checked out with `npm install` done. Node 22.

**Claude Code** — copy `.mcp.json.example` to `.mcp.json` at the repo root (`.mcp.json` is gitignored) and export the key in your shell. Claude Code expands `${VAR}` in `.mcp.json`:

```json
{
  "mcpServers": {
    "cityroam": {
      "command": "node",
      "args": ["packages/mcp/bin/cityroam-mcp.mjs"],
      "env": {
        "CITYROAM_ENV": "staging",
        "CITYROAM_API_KEY_STAGING": "${CITYROAM_API_KEY_STAGING}"
      }
    }
  }
}
```

**Claude Desktop** — see `packages/mcp/README.md` for a config with absolute Windows paths (Desktop does not expand variables).

Check it: in Claude Code run `/mcp`; the `cityroam` server should be connected with 24 tools. Every tool result starts with `[staging]`, `[PRODUCTION]` or `[local]`.

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `CITYROAM_ENV` | `staging` | `staging`, `production` or `local`. The server is pinned to this one environment for its lifetime. |
| `CITYROAM_API_KEY_STAGING` | — | Key used when `CITYROAM_ENV=staging`. Must start `crk_stg_`. |
| `CITYROAM_API_KEY_PRODUCTION` | — | Key used when `CITYROAM_ENV=production`. Must start `crk_prd_`. |
| `CITYROAM_API_KEY_LOCAL` | — | Key used when `CITYROAM_ENV=local`. Must start `crk_dev_`. |
| `CITYROAM_ALLOW_PRODUCTION` | — | Must be `1` as well as `CITYROAM_ENV=production`, or the server refuses to start. |
| `CITYROAM_API_URL` | per env | Override the API base URL. Defaults: staging `https://api-staging.cityroam.co.uk`, production `https://api.cityroam.co.uk`, local `http://localhost:3001`. |
| `CITYROAM_DOCS_DIR` | `docs/llm-authoring` in this repo | Where the `cityroam://docs/*` resources and prompt attachments are read from. |
| `CITYROAM_IMAGE_ROOTS` | none | Directories `upload_image` may read local files from, separated by the OS path delimiter (`;` on Windows, `:` elsewhere). With none set, only URL sources work. |

The server checks at startup that the key's `crk_<env>_` segment matches `CITYROAM_ENV`, so a key pasted into the wrong config fails before any request is sent. It never logs the key; all logging goes to stderr (stdout is the protocol channel).

---

## Tools

### Read

| Tool | What it does |
|---|---|
| `list_route_families` | Route families (optional `city` filter) |
| `get_route_family` | One family and its language variants |
| `get_route_facts` | A family's route facts (start point, distance, walking time, stops, step-free, dogs, toilets, cover), marking the unset ones that the marketing site hides |
| `list_routes` | Routes, optionally filtered by family, language, active |
| `get_route` | A route with its groups and blocks: `format: "compact"` (default, one line per block) or `"tree"` (full JSON) |
| `list_message_banks` | Message bank entries, filtered by `type` and/or `language` |
| `list_image_slugs` | `{{IMAGE:slug}}` placeholders used by a route, a family or every route, whether each has a photo uploaded in this environment, and uploaded slugs nothing uses |
| `validate_route` | Lints a stored route (`route_id`) or a draft bulk payload (`payload`) against the shared schemas and the content-guide rules (hint counts, answer variants, image refs, map links, delays, template variables including `{{GUIDE_NAME}}`, owl puns). Local, sends nothing for a payload. |

### Write

| Tool | Notes |
|---|---|
| `create_route` | Whole route in one call (`POST /admin/routes/bulk-groups`). Lints first; errors block unless `force: true` (schema errors always block). `is_active` is not an input and is always sent as `false`. |
| `update_route` | Route metadata; GET-merge-PUT. Sends the route's current `is_active`, so it can neither activate nor deactivate. |
| `add_group`, `update_group`, `delete_group`, `reorder_groups` | Groups, optionally with blocks and a position on `add_group` |
| `add_block`, `update_block`, `patch_block_config`, `move_block`, `delete_block`, `reorder_blocks` | Blocks. `patch_block_config` deep-merges a partial config (objects merge, arrays replace) and cannot change the type. |
| `upload_image` | JPEG/PNG ≤ 5 MB from a local file inside `CITYROAM_IMAGE_ROOTS` or an http(s) URL. With `slug` (JPEG only) it becomes the photo for every `{{IMAGE:slug}}`. |
| `create_message_bank_entry`, `update_message_bank_entry` | Guide lines. No delete: deactivate with `is_active: false`. |
| `update_route_facts` | A family's route facts, GET-merge-PUT: only the facts you give change, `null` clears one (hides it on the site), `startPoint` is replaced whole. The merged set is re-parsed with the shared `routeFactsInputSchema` before anything is sent; `dry_run` shows the request and a before/after list. Only enter facts checked on the ground; the start point must never be a stop. |

Tools keyed by a block or group id accept an optional `route_id` hint; without it they search the routes to find the owner.

### Safety rules

- **`dry_run: true`** on every write tool. `create_route` sends the API's `?dry_run=true`, which runs the whole create in a transaction and rolls it back. `upload_image` runs every check (file, type, size, slug, existing photo) and uploads nothing. The other tools only GET: they return the exact method, path and body they would send plus a field-level diff. Use it before any write you are unsure about.
- **`confirm_live: true`** is required for every write that touches an **active** route (including moves, deletes and reorders). A dry run is never blocked; it tells you the real call needs it. Content edits on a route with live events succeed with a warning on the first line of the result (`X-Live-Events`); positional changes during live events are refused by the API (`409 GROUP_HAS_LIVE_EVENTS` / `BLOCK_HAS_LIVE_EVENTS`).
- **`confirm: true`** is required on `delete_group` and `delete_block`.
- **`overwrite: true`** is required for `upload_image` to replace a slug photo that exists or might exist.
- **Routes are always created inactive.** No tool can set `is_active: true`; a human reviews the route and activates it in the admin UI.
- After every successful write the route is re-fetched and returned as the compact tree, so the transcript always shows the current state.

---

## Resources

| URI | Content |
|---|---|
| `cityroam://docs/api-reference` | `api-reference.md` |
| `cityroam://docs/content-guide` | `content-guide.md` |
| `cityroam://docs/guide-personality` | `guide-personality.md` |
| `cityroam://docs/data-model` | `data-model.md` |
| `cityroam://docs/translation-guide` | `translation-guide.md` |
| `cityroam://routes/{route_id}` | A route with groups and blocks, as JSON |

Docs are read at request time, so edits show up without restarting the server.

## Prompts

| Prompt | Arguments | What it does |
|---|---|---|
| `author_route` | `city`, optional `theme`, `stops`, `language` (default `en`) | Attaches the four authoring docs and walks the model through research → draft → `validate_route` → `create_route` with `dry_run` → `create_route` → `list_image_slugs` → `upload_image`, reminding it the route is created inactive and a human activates it. It also tells the model the guide is the Owl: introduce it once in the intro with `{{GUIDE_NAME}}`, no puns. |
| `translate_route` | `route_id`, `target_language` | Attaches `translation-guide.md` and walks through reading the source route, checking the family for an existing variant, drafting the translated payload in the same family (keeping `{{GUIDE_NAME}}` and agreeing with the name's gender in the target language), validating, creating (inactive), and filling missing message bank entries for the language. |

---

## Staging vs production

- **Author on staging.** It is the default, and the server refuses production unless both `CITYROAM_ENV=production` and `CITYROAM_ALLOW_PRODUCTION=1` are set with a `crk_prd_` key. Only target production when the owner explicitly asks.
- Run two server entries side by side if you need both (see the README's staging + production example); each is pinned to its own environment and every result is tagged, so the transcript shows where each write landed.
- Staging and production have **separate S3 buckets**. Photos uploaded on staging must be uploaded again on production. Block content stays identical because it refers to `{{IMAGE:slug}}`, not a URL: run `list_image_slugs` on production after copying a route to see what is missing.
- There is no copy-route tool. To move a route from staging to production, read it on staging (`get_route` with `format: "tree"`) and create it on production with `create_route` (dry run first), then have a human activate it.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Server does not start: `No API key for staging` | Set `CITYROAM_API_KEY_STAGING` (or the variable for your `CITYROAM_ENV`). In Claude Code the variable must be exported in the shell that launched `claude`. |
| `… is not a staging key: expected a key starting "crk_stg_"` | Key and environment mismatch. Use a key created on the environment you are pinned to. |
| `Refusing to start against PRODUCTION` | Set `CITYROAM_ALLOW_PRODUCTION=1` too, and only if production is intended. |
| `401 ADMIN_UNAUTHORIZED` | Key revoked, expired, mistyped, or created on a different deployment (the API checks `API_KEY_ENV`). Create a new key. |
| `403 ADMIN_SCOPE_REQUIRED` | The key lacks the scope named in the message. Create a key with it (scopes cannot be edited). Also returned if anything tries to activate a route. |
| `403 ADMIN_SESSION_REQUIRED` | The endpoint is admin-panel only. Not reachable with any key, on purpose. |
| `429 RATE_LIMITED` | 300 reads / 60 writes per minute per key. The server retries once after `Retry-After`; slow down or batch (e.g. `create_route` instead of many `add_block`s). |
| `list_image_slugs` says uploaded is `unknown` | The bucket listing failed: the API's IAM user needs `s3:ListBucket` on that environment's bucket, or the key lacks `images:read`. Without `s3:ListBucket`, S3 also answers `HeadObject` on a missing key with 403, so `upload_image` treats the slug as "may exist" and needs `overwrite: true`. Locally without S3 this is expected. |
| `upload_image`: path not allowed | The file must be inside one of `CITYROAM_IMAGE_ROOTS` (symlinks are resolved; no escaping the root). |
| Docs resource: `Doc … not found` | Set `CITYROAM_DOCS_DIR` to the absolute path of `docs/llm-authoring`. |
| `NETWORK_ERROR` / `TIMEOUT` | Wrong `CITYROAM_API_URL`, API down, or (locally) the API is not running on port 3001. |
