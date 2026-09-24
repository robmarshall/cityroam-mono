# Owl rollout: updating live route intros

The guide is now called the Owl (see [guide-personality.md > The Owl](guide-personality.md#the-owl)). The code ships the name everywhere it controls: the chat label, the question prompt, the cap notice, the emails, and the seed routes. **Route content in staging and production is data, not code**, so no migration changes it. Each live route's introduction group has to be updated by hand, once per environment, using the MCP tools.

This runbook covers that one-off edit: each route's intro introduces the guide once, with `{{GUIDE_NAME}}`.

---

## Before you start

1. **Deploy the API first.** `{{GUIDE_NAME}}` is substituted by `buildRouteTemplateVars` (packages/api/src/services/template-vars.ts). An API that predates the Owl release shows the token to players literally. Check the release is live on the environment before editing any content there.
2. **Run the MCP server from a checkout that includes the release.** Its linter (`validate_route`) only knows `{{GUIDE_NAME}}` from that version on. An older checkout flags it as `template-unknown`.
3. **Staging first, then production.** Point the server at staging (`CITYROAM_ENV=staging`, the default). Only switch to production once staging has been checked in the app (see [mcp.md > Staging vs production](mcp.md#staging-vs-production)).
4. You need a key with `routes:read` and `routes:write`.

---

## Per environment

### 1. Find the routes

- `list_routes` shows every route, with its language and whether it is active.
- Start with the active ones. Inactive drafts can be done the same way, and they need no `confirm_live`.

### 2. Read each route

- Call `get_route` with the `route_id` (compact format is enough).
- Find the introduction group, which is the first one.
- Pick the message block to change. Use the one that establishes who the guide is: usually the second block, at around 1500ms ("I know these streets better than most…").
- Note its `block_id`, and check that no block in the route already says "the Owl" or uses `{{GUIDE_NAME}}`.

### 3. Draft the new line

Put `I'm {{GUIDE_NAME}}.` (or the equivalent in the route's language) at the start of that block. Keep the rest of the line, and keep the block to 2 sentences or fewer:

| Language | Example |
|----------|---------|
| en | `I'm {{GUIDE_NAME}}. I know these streets better than most — you just need to keep up.` |
| es | `Soy {{GUIDE_NAME}}. Conozco estas calles mejor que la mayoría; vosotros solo tenéis que seguir el ritmo.` |
| fr | `Je suis {{GUIDE_NAME}}. Je connais ces rues mieux que la plupart ; vous n'avez qu'à suivre.` |
| de | `Ich bin {{GUIDE_NAME}}. Ich kenne diese Straßen besser als die meisten – ihr müsst nur mithalten.` |
| nl | `Ik ben {{GUIDE_NAME}}. Ik ken deze straten beter dan de meesten – jullie hoeven alleen maar bij te houden.` |

Rules:

- Never hard-code the name.
- Introduce the guide once per route.
- No owl puns.
- If the route's wording differs from the seed, adapt it. Check first-person agreement: masculine in es and fr, feminine in de ([translation-guide.md > The Guide's Name](translation-guide.md#the-guides-name)).

### 4. Dry run

Call `patch_block_config` with the new content and `dry_run: true`:

```
block_id: <id>, route_id: <route id>,
config_patch: { "content": "I'm {{GUIDE_NAME}}. I know these streets better than most — you just need to keep up." },
dry_run: true
```

`update_block` works too, but it replaces the whole block (type, config and `delay_ms`). `patch_block_config` changes only the content.

The dry run returns the exact request and a field-level diff. Block writes are not linted (only `create_route` is), so check the text by eye. Check that:

- only `content` changes;
- `{{GUIDE_NAME}}` is spelled exactly, with double braces and uppercase;
- the block is still 2 sentences or fewer;
- the result says whether the real call needs `confirm_live`.

### 5. Write

- Repeat the call without `dry_run`.
- If the route is active, add `confirm_live: true`. Ask the owner first: this edits content that players see.
- A content edit on a route with live events goes through, with a warning on the first line of the result. Games already past the intro are not affected. A group that hasn't started yet sees the new line.

### 6. Check

- `validate_route` with the `route_id` should report no errors and no `guide-pun` or `message-too-long` warning on the intro.
- On staging, start a test event in each language you changed. The intro should read "I'm The Owl." (or "Soy El Búho.", "Je suis Le Hibou.", "Ich bin Die Eule.", "Ik ben De Uil."), with no literal `{{GUIDE_NAME}}`.

---

## Production

- Repeat steps 1–6 with the server pinned to production. That needs `CITYROAM_ENV=production`, `CITYROAM_ALLOW_PRODUCTION=1` and a `crk_prd_` key, and only on the owner's say-so.
- Block ids differ between environments, so always read the route on production first. Don't reuse ids from staging.

## Message banks

- No change is required. No seeded bank line names the guide, and existing first-person lines already agree with the names' genders.
- `{{GUIDE_NAME}}` also works in completion templates if someone wants it there later. Keep to the one-reference-per-game rule.
