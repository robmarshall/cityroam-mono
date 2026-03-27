# City Roam v2

AI-driven development loop powered by Claude Code running inside Docker.

## Prerequisites

- Docker and Docker Compose
- Claude Code account (for authentication)

## Quick Start

```bash
npm run start
```

This single command builds the Docker image, starts the container, and launches the build loop inside it.

## Setup

### 1. Build and start the container

```bash
docker compose up -d --build
```

### 2. Shell into the container

```bash
docker compose exec dev bash
```

### 3. Authenticate Claude (first time only)

From inside the container:

```bash
claude login
```

Your credentials are persisted via a volume mount to `~/.claude` on the host, so you only need to do this once.

### 4. Run the loop

From inside the container:

```bash
./loop.sh              # Build mode, unlimited iterations
./loop.sh 20           # Build mode, max 20 iterations
./loop.sh plan         # Plan mode, unlimited iterations
./loop.sh plan 5       # Plan mode, max 5 iterations
```

## Loop Modes

### Build mode (default)

Cycles through four stages automatically, reading the current stage from `IN_PROGRESS.md`:

1. **implement** - `PROMPT_implement.md` - Write code
2. **test** - `PROMPT_test.md` - Write and run tests
3. **review** - `PROMPT_review.md` - Review changes
4. **commit** - `PROMPT_commit.md` - Commit the work

### Plan mode

Runs `PROMPT_plan.md` in a loop for planning/research tasks.

## npm Scripts

| Script | Description |
|---|---|
| `npm run loop` | Build, start container, and run the build loop |
| `npm run loop:plan` | Build, start container, and run the plan loop |
| `npm run loop:plan -- 5` | Plan loop, max 5 iterations |
| `npm run docker:build` | Build and start the container in the background |
| `npm run docker:shell` | Open a shell inside the running container |
| `npm run docker:down` | Stop and remove the container |

## Stopping

- Press `Ctrl+C` inside the loop for a graceful shutdown (finishes the current iteration).
- Run `docker compose down` to stop the container.
