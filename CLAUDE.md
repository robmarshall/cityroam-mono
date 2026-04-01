# Project Overview

City Roam is a self-guided treasure hunt web app. Customers purchase a hunt via Stripe on the marketing site, receive an event code, then use the app to play through a series of location-based clues guided by an AI chatbot (DeepSeek). An admin panel allows managing routes, groups, blocks, message banks, and monitoring events.

## Architecture

Monorepo (npm workspaces) with 5 packages:

- **packages/shared** — Types, validation (Zod), constants, utilities, Tailwind preset
- **packages/api** — Hono HTTP + WebSocket servers, Drizzle ORM (Postgres), Redis (ioredis), Stripe, AI pipeline
- **packages/app** — Vite + React player-facing SPA (served at `/app/` in production)
- **packages/admin** — Vite + React admin panel (served on `admin.` subdomain in production)
- **packages/marketing** — Next.js marketing/checkout site

## Key Infrastructure

- **Database**: PostgreSQL 16 via Drizzle ORM, migrations in `packages/api/src/db/`
- **Cache/Pub-Sub**: Redis 7 (sessions, chat cache, rate limiting, inter-process messaging)
- **Payments**: Stripe Checkout with webhook-driven event creation
- **AI**: DeepSeek LLM for intent classification and guide responses
- **Deployment**: Docker containers on Coolify with Traefik routing

## Development

- `npm run dev` starts all services via `run-p` (postgres/redis must be running via Docker)
- API runs on port 3001, WS on 3002, app on 5173, admin on 5174, marketing on 3000
- `.env` at project root is loaded by Vite (via `envDir`) and tsx (via `--env-file`)

## LLM Route Authoring

Documentation for programmatically creating and editing treasure hunt routes lives in `docs/llm-authoring/`. When asked to create or edit a route, read all four files first:

- `api-reference.md` — API endpoints, auth, request/response formats
- `content-guide.md` — How to write clues, hints, directions, fun facts
- `guide-personality.md` — Guide tone, message bank types and examples
- `data-model.md` — Entity relationships, AI pipeline behaviour, answer matching rules

Use `POST /admin/routes/bulk-groups` to create a complete route with all groups and blocks in one call. Use the individual CRUD endpoints for edits.

# Preferences

- Never autosave. Save should always be an intentional user action via an explicit "Save" button. This applies to all admin UI: forms, reorder actions, inline edits, etc.
