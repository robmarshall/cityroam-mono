# @cityroam/mcp

A stdio MCP server for authoring City Roam treasure hunt routes through the admin API with a scoped API key. Full documentation (setup, environment variables, tools, safety rules, troubleshooting): [`docs/llm-authoring/mcp.md`](../../docs/llm-authoring/mcp.md).

```bash
npm install                      # from the repo root
npm test -w @cityroam/mcp
npm run typecheck -w @cityroam/mcp
```

The server runs from source through `tsx`: `node packages/mcp/bin/cityroam-mcp.mjs` (works from any directory when given an absolute path) or `node --import tsx packages/mcp/src/index.ts` from the repo root. It exits at startup with a message on stderr if the environment or key is wrong.

## Claude Code

Copy `.mcp.json.example` at the repo root to `.mcp.json` (gitignored) and export `CITYROAM_API_KEY_STAGING` before starting `claude`.

## Claude Desktop

Claude Desktop does not expand environment variables and does not run from the repo, so use absolute paths and put the key in the config. Edit `%APPDATA%\Claude\claude_desktop_config.json` (keep that file private: it holds the key):

```json
{
  "mcpServers": {
    "cityroam": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["D:\\projects\\cityroam-mono\\packages\\mcp\\bin\\cityroam-mcp.mjs"],
      "env": {
        "CITYROAM_ENV": "staging",
        "CITYROAM_API_KEY_STAGING": "crk_stg_…",
        "CITYROAM_DOCS_DIR": "D:\\projects\\cityroam-mono\\docs\\llm-authoring",
        "CITYROAM_IMAGE_ROOTS": "D:\\photos\\cityroam"
      }
    }
  }
}
```

`CITYROAM_DOCS_DIR` is optional when the server runs from the repo checkout (it defaults to `docs/llm-authoring` next to the package), but setting it makes the config explicit. Restart Claude Desktop after editing.

### Staging and production side by side

Two entries, each pinned to its own environment. Every tool result is tagged `[staging]` or `[PRODUCTION]`, and the production entry only starts with `CITYROAM_ALLOW_PRODUCTION=1` and a `crk_prd_` key. Only use it when the owner has asked for a production change; remove or disable it the rest of the time.

```json
{
  "mcpServers": {
    "cityroam-staging": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["D:\\projects\\cityroam-mono\\packages\\mcp\\bin\\cityroam-mcp.mjs"],
      "env": {
        "CITYROAM_ENV": "staging",
        "CITYROAM_API_KEY_STAGING": "crk_stg_…",
        "CITYROAM_IMAGE_ROOTS": "D:\\photos\\cityroam"
      }
    },
    "cityroam-production": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["D:\\projects\\cityroam-mono\\packages\\mcp\\bin\\cityroam-mcp.mjs"],
      "env": {
        "CITYROAM_ENV": "production",
        "CITYROAM_ALLOW_PRODUCTION": "1",
        "CITYROAM_API_KEY_PRODUCTION": "crk_prd_…",
        "CITYROAM_IMAGE_ROOTS": "D:\\photos\\cityroam"
      }
    }
  }
}
```

Give the production key the fewest scopes that do the job (e.g. `routes:read` plus `routes:write` for copying a finished route; add `images:write` only for the photo upload).

## Layout

- `src/index.ts` — stdio entry point; `src/server.ts` — builds the server (fetch injectable for tests)
- `src/config.ts` — environment pinning and key checks
- `src/tools/` — read, write, image and message bank tools
- `src/lint/` — `validate_route` rules
- `src/resources.ts`, `src/prompts.ts` — docs resources, route resource, `author_route` / `translate_route`
