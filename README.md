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

This starts Postgres, Redis, API (HTTP + WS), App, Admin, and Marketing in containers. Useful for testing production-like setups. See also `docker-compose.prod.yml` and `docker-compose.staging.yml` for deployment configurations.

| Script | Description |
|---|---|
| `npm run docker:build` | Build and start all containers |
| `npm run docker:shell` | Open a shell inside the dev container |
| `npm run docker:down` | Stop and remove containers |
| `npm run docker:migrate` | Run migrations inside container |
| `npm run docker:seed` | Seed database inside container |

## Deployment

Production runs the frontends on Vercel and the API, Postgres and Redis on
Coolify. `docker-compose.prod.yml` is the full-stack fallback and
`docker-compose.staging.yml` is backend-only.

### Build-time vs runtime variables

Vite (`VITE_*`) and Next.js (`NEXT_PUBLIC_*`) **inline** their public values into
the JS bundle when it is built. Setting them only at runtime does nothing — the
bundle already carries whatever was baked in. This is what made the compose path
ship an app that dialled `ws://localhost:3002` in production.

`docker-compose.prod.yml` therefore passes them as `build.args`, and each
frontend Dockerfile fails the build when a required one is empty:

| Image | Required build args | Optional |
|---|---|---|
| `packages/app` | `VITE_API_URL`, `VITE_WS_URL` | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_REVIEW_LINK` |
| `packages/admin` | `VITE_API_URL` | — |
| `packages/marketing` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` | `NEXT_PUBLIC_POSTHOG_KEY` |

On Vercel the same names are set as project environment variables instead.

### Routing variables

Every domain used in a Traefik `Host()` rule is interpolated with `${VAR:?...}`,
so an unset value aborts the deploy. Previously an unset variable produced an
empty rule and a silent 404.

| File | Required |
|---|---|
| `docker-compose.prod.yml` | `DOMAIN`, `API_DOMAIN`, `ADMIN_DOMAIN`, `POSTGRES_PASSWORD` |
| `docker-compose.staging.yml` | `API_DOMAIN`, `WS_DOMAIN`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD` |

In production the WebSocket server is reached on the API domain: Traefik routes
`PathPrefix(/ws/)` to the `api-ws` container on port 3002, so `VITE_WS_URL` is
`wss://<API_DOMAIN>` with no port. Staging gives it a separate `WS_DOMAIN`.

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

Your credentials are persisted via a volume mount to `~/.claude` on the host, so you only need to do this once.

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
