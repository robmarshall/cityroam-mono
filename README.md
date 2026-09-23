# City Roam v2

Self-guided treasure hunt web app. Customers purchase a hunt via Stripe, receive an event code, then play through location-based clues guided by an AI chatbot.

## Tech Stack

- **Monorepo**: npm workspaces, TypeScript
- **API**: Hono (HTTP + WebSocket), Drizzle ORM, PostgreSQL 16, Redis 7
- **App**: Vite + React 19 (player SPA)
- **Admin**: Vite + React 19 (admin panel)
- **Marketing**: Next.js 15 (checkout + landing pages)
- **AI**: DeepSeek LLM for guide responses
- **Payments**: Stripe Checkout + webhooks

## Prerequisites

- Node.js 22 LTS (see `.nvmrc`); `engines` allows 22-24
- Docker and Docker Compose (for Postgres, Redis, and optional full-stack containers)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker compose up postgres redis -d
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in required values — see `.env.example` for descriptions. In development, missing non-critical API keys default to placeholders.

### 4. Run database migrations and seed

```bash
npm run migrate
npm run seed
```

### 5. Start development

```bash
npm run dev
```

This starts all services in parallel via `npm-run-all`.

### Services

| Service   | URL                  | Script                |
|-----------|----------------------|-----------------------|
| Marketing | http://localhost:3000 | `npm run dev:marketing` |
| API HTTP  | http://localhost:3001 | `npm run dev:api:http`  |
| API WS    | ws://localhost:3002   | `npm run dev:api:ws`    |
| App       | http://localhost:5173 | `npm run dev:app`       |
| Admin     | http://localhost:5174 | `npm run dev:admin`     |

## Project Structure

```
packages/
  shared/     — Types, Zod validation, constants, utilities, Tailwind preset
  api/        — Hono HTTP + WebSocket servers, Drizzle ORM, Redis, Stripe, AI pipeline
  app/        — Vite + React player-facing SPA
  admin/      — Vite + React admin panel
  marketing/  — Next.js marketing/checkout site
```

## Database

PostgreSQL 16 via Drizzle ORM. Schema in `packages/api/src/db/schema/`, migrations in `packages/api/drizzle/`.

```bash
npm run migrate             # Run pending migrations
npm run seed                # Seed core data (message banks + dev routes)
npm run seed:message-banks  # Seed message bank templates only
```

## Testing

All five packages define `test`, `build` and `typecheck`, so the workspace-wide
scripts no longer use `--if-present` — a package that loses a script fails loudly
instead of being silently skipped.

```bash
npm test                             # All five packages
npm -w @cityroam/api run test        # API tests only
npm -w @cityroam/shared run test     # Shared package tests only
npm -w @cityroam/app run test        # Player app smoke tests
npm -w @cityroam/admin run test      # Admin smoke tests
npm -w @cityroam/marketing run test  # Marketing i18n smoke tests
npm run typecheck                    # TypeScript checks across all packages
```

## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main`/`development` and on
every pull request, in three parallel jobs:

| Job | What it does |
|---|---|
| `verify` | Node from `.nvmrc`, `npm ci`, `npm run typecheck`, `npm test`, `npm run build` |
| `docker` | Builds the API, app, admin and marketing images with placeholder build args |
| `compose` | `docker compose config` on the prod and staging files, to catch interpolation drift |

The build and docker jobs pass placeholder public URLs. They prove the build
compiles and that the Dockerfiles wire their build args through; they are not
deployment values.

## Docker (Full Stack)

To run all services in containers (instead of `npm run dev` on the host):

```bash
docker compose up -d --build
```

This starts Postgres, Redis, API (HTTP + WS), App, Admin, and Marketing in containers, using the dev servers against the bind-mounted source. See also `docker-compose.prod.yml` and `docker-compose.staging.yml` for the backend-only deployment configurations.

| Script | Description |
|---|---|
| `npm run docker:build` | Build and start all containers |
| `npm run docker:shell` | Open a shell inside the dev container |
| `npm run docker:down` | Stop and remove containers |
| `npm run docker:migrate` | Run migrations inside container |
| `npm run docker:seed` | Seed database inside container |
| `npm run docker:prod:migrate` | Run migrations in a running `docker-compose.prod.yml` `api-http` container (uses the built `start:migrate`) |
| `npm run docker:prod:seed` | Run the full seed in the prod `api-http` container (`start:seed`, includes dev routes) |
| `npm run docker:prod:seed:message-banks` | Seed message banks only in the prod `api-http` container (`start:seed:message-banks`; the safe seeder for production, pass `-- --dry-run` to preview) |

## Deployment

Production and staging both run the frontends (app, admin, marketing) on Vercel
and the API, WebSocket server, Postgres and Redis on Coolify.
`docker-compose.prod.yml` and `docker-compose.staging.yml` are both
backend-only and mirror each other. A Cloudflare worker on the main domain sends
`/app` and `/app/...` to the player-app Vercel project and everything else to
marketing; see `infra/cloudflare-workers/README.md`.

The frontend Dockerfiles remain for CI build checks and self-hosting, but no
compose file deploys them.

### Build-time vs runtime variables

Vite (`VITE_*`) and Next.js (`NEXT_PUBLIC_*`) **inline** their public values into
the JS bundle when it is built. Setting them only at runtime does nothing — the
bundle already carries whatever was baked in. This is what made the compose path
ship an app that dialled `ws://localhost:3002` in production.

Each frontend Dockerfile takes them as build args and fails the build when a
required one is empty:

| Image | Required build args | Optional |
|---|---|---|
| `packages/app` | `VITE_API_URL`, `VITE_WS_URL` | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_REVIEW_LINK` |
| `packages/admin` | `VITE_API_URL` | — |
| `packages/marketing` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` | `NEXT_PUBLIC_POSTHOG_KEY` |

On Vercel the same names are set as project environment variables instead.

### Routing variables

The compose files define no Traefik routers. Domains are set in Coolify's
Domains setting on each service (`API_DOMAIN` on api-http, `WS_DOMAIN` on
api-ws), and Coolify generates the routers and certificates. Compose-defined
router labels were dropped because Coolify wrote them without interpolating
`${...}`, producing invalid rules and failed ACME requests on every deploy. Both
services carry `traefik.docker.network=coolify` so Traefik always uses the
network coolify-proxy shares; without it Traefik sometimes picked the
unreachable `cityroam-network` IP and answered 503.

| File | Required |
|---|---|
| `docker-compose.prod.yml` | `POSTGRES_PASSWORD`, `REDIS_PASSWORD` |
| `docker-compose.staging.yml` | `POSTGRES_PASSWORD`, `REDIS_PASSWORD` |

Both environments give the WebSocket server its own `WS_DOMAIN`, routed by
Traefik to `api-ws` on port 3002. The player app appends `/ws/<code>` itself, so
set `VITE_WS_URL` on the app's Vercel project to `wss://<WS_DOMAIN>` with no path
and no port (e.g. `wss://ws.cityroam.co.uk`), and `VITE_API_URL` to
`https://<API_DOMAIN>`.

`SENTRY_DSN`, `SENTRY_ENVIRONMENT` and `SENTRY_RELEASE` are optional in both
files and passed to `api-http` and `api-ws`. Set `SENTRY_ENVIRONMENT` explicitly
(`staging` / `production`): empty falls back to `NODE_ENV`, which is
`production` in both. See the Sentry section of `docs/launch-checklist.md`.

Production Traefik services are named `cityroam-prod-api-http` and
`cityroam-prod-api-ws`, so they do not merge with staging's `api-http` and
`api-ws` services when both stacks share one Coolify Traefik.

Migrations run as a one-shot `migrate` service; `api-http` and `api-ws` both wait
on `service_completed_successfully` before starting.

### Node version

`.nvmrc` and every Docker base image are on Node 22 LTS. Vercel ends Node 20
support on 2026-10-01 — **the Node version in the Vercel project settings must be
changed there manually**, it is not driven by `.nvmrc`.

## Automated Development Loop

AI-driven development loop powered by Claude Code running inside Docker. Cycles through stages automatically: **implement** → **test** → **review** → **commit**.

### Prerequisites

- Claude Code account (for authentication)

### Setup

#### 1. Build and start the container

```bash
docker compose up -d --build
```

#### 2. Shell into the container

```bash
docker compose exec dev bash
```

#### 3. Authenticate Claude (first time only)

From inside the container:

```bash
claude login
```

The compose file no longer bind-mounts your host `~/.claude` or `~/.ssh`, so
credentials live only inside the container and are lost when it is removed. To
persist them, add your own mount in a `docker-compose.override.yml` (not
committed), for example `- ~/.claude:/home/dev/.claude`.

On first start the `dev` container runs `npm ci` if `node_modules` is missing.

#### 4. Run the loop

From inside the container:

```bash
./loop.sh              # Build mode, unlimited iterations
./loop.sh 20           # Build mode, max 20 iterations
./loop.sh plan         # Plan mode, unlimited iterations
./loop.sh plan 5       # Plan mode, max 5 iterations
```

### Loop Modes

**Build mode** (default) cycles through four stages, reading the current stage from `IN_PROGRESS.md`:

1. **implement** — `PROMPT_implement.md` — Write code
2. **test** — `PROMPT_test.md` — Write and run tests
3. **review** — `PROMPT_review.md` — Review changes
4. **commit** — `PROMPT_commit.md` — Commit the work

**Plan mode** runs `PROMPT_plan.md` in a loop for planning/research tasks.

### npm Scripts

The `loop` and `loop:plan` scripts were removed: they ran `run.sh`, which is no
longer in the repository. Run `./loop.sh` from inside the container instead.

| Script | Description |
|---|---|
| `npm run docker:build` | Build and start the container in the background |
| `npm run docker:shell` | Open a shell inside the running container |
| `npm run docker:down` | Stop and remove the container |

### Stopping

- Press `Ctrl+C` inside the loop for a graceful shutdown (finishes the current iteration).
- Run `docker compose down` to stop the container.
