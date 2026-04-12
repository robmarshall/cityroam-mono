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

## Environment

- Node 20 (`.nvmrc`). Copy `.env.example` to `.env` before running.
- In development, missing non-critical API keys default to `"dev-placeholder"` (validated in `packages/api/src/env.ts`).

## Development

- `npm run dev` starts all services via `run-p` (postgres/redis must be running via Docker)
- API runs on port 3001, WS on 3002, app on 5173, admin on 5174, marketing on 3000

## Docker Services

- `docker compose up postgres redis -d` starts infrastructure for local dev
- `docker compose up -d --build` starts all services in containers (full-stack)
- Production: `docker-compose.prod.yml` (Coolify + Traefik), Staging: `docker-compose.staging.yml`

## Database

- PostgreSQL 16 via Drizzle ORM. Schema in `packages/api/src/db/schema/`, migrations in `packages/api/drizzle/`
- `npm run migrate` — run pending migrations
- `npm run seed` — seed core data (message banks + dev routes)
- `npm run seed:message-banks` — seed message bank templates only
- `drizzle-kit generate` (in packages/api) to generate new migrations from schema changes

## Testing

- Vitest. Config at `packages/api/vitest.config.ts`
- `npm test` — run all package tests
- `npm run typecheck` — TypeScript checks across all packages

## LLM Route Authoring

Documentation for programmatically creating and editing treasure hunt routes lives in `docs/llm-authoring/`. When asked to create or edit a route, read all four files first:

- `api-reference.md` — API endpoints, auth, request/response formats
- `content-guide.md` — How to write clues, hints, directions, fun facts
- `guide-personality.md` — Guide tone, message bank types and examples
- `data-model.md` — Entity relationships, AI pipeline behaviour, answer matching rules

Use `POST /admin/routes/bulk-groups` to create a complete route with all groups and blocks in one call. Use the individual CRUD endpoints for edits.

## Automation Loop

- `loop.sh` drives automated development inside the Docker dev container
- **Build mode** (default): cycles implement → test → review → commit, reading stage from `IN_PROGRESS.md`
- **Plan mode**: runs `PROMPT_plan.md` for planning/research
- Usage: `./loop.sh [plan] [max_iterations]`
- `AUTOMATION_LOCK` prevents concurrent agent execution
- `PROMPT_*.md` files contain stage-specific instructions

# Preferences

- Never autosave. Save should always be an intentional user action via an explicit "Save" button. This applies to all admin UI: forms, reorder actions, inline edits, etc.
