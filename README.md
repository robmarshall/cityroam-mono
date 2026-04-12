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

- Node.js 20 (see `.nvmrc`)
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

```bash
npm test                          # All packages
npm -w @cityroam/api run test     # API tests only
npm -w @cityroam/shared run test  # Shared package tests only
npm run typecheck                 # TypeScript checks across all packages
```

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

## Automated Development Loop

AI-driven development loop powered by Claude Code running inside Docker. Cycles through stages automatically: **implement** → **test** → **review** → **commit**.

### Prerequisites

- Claude Code account (for authentication)

### Quick Start

```bash
npm run start
```

This builds the Docker image, starts the container, and launches the build loop inside it.

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

| Script | Description |
|---|---|
| `npm run loop` | Build, start container, and run the build loop |
| `npm run loop:plan` | Build, start container, and run the plan loop |
| `npm run loop:plan -- 5` | Plan loop, max 5 iterations |
| `npm run docker:build` | Build and start the container in the background |
| `npm run docker:shell` | Open a shell inside the running container |
| `npm run docker:down` | Stop and remove the container |

### Stopping

- Press `Ctrl+C` inside the loop for a graceful shutdown (finishes the current iteration).
- Run `docker compose down` to stop the container.
