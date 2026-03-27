# Spec 10: Deployment & Infrastructure

## Goal
Configure Docker, build pipelines, and Coolify deployment for all services.

## Deliverables

### 10.1 Docker Configuration

**`docker-compose.yml` for local development:**

Services:
- `postgres` — PostgreSQL 16, port 5432, volume for data persistence
- `redis` — Redis 7 with AOF persistence enabled (`appendonly yes`), port 6379, volume for data
- `api-http` — Hono HTTP process, port 3001, depends_on postgres + redis, volume mount `packages/` for hot reload
- `api-ws` — Hono WS process, port 3002, depends_on postgres + redis, volume mount `packages/` for hot reload
- `app` — Vite dev server, port 5173, volume mount `packages/app/` for hot reload
- `marketing` — Next.js dev server, port 3000, volume mount `packages/marketing/` for hot reload
- `admin` — Vite dev server, port 5174, volume mount `packages/admin/` for hot reload

Shared network: `cityroam-network` (bridge)

Environment variables loaded from `.env` file (one file at root, docker-compose maps to each service).

**Note on local HTTPS:** For local development, `SameSite=None` cookies require HTTPS. Options:
- Use `localhost` (browsers exempt localhost from Secure requirement) — simplest for local dev
- Use mkcert to generate local SSL certs and configure Vite/Next.js/Hono with them
- The docker-compose should document this in comments

### 10.2 Production Dockerfiles

Multi-stage Dockerfiles for each deployable package:

**API (shared Dockerfile, two start commands):**
- Stage 1: `node:20-alpine` — install deps, copy all packages, build shared + api
- Stage 2: `node:20-alpine` — copy built output + node_modules, expose port
- CMD varies by service: `npm run start:http` or `npm run start:ws`

**Marketing:**
- Stage 1: build Next.js (`next build`)
- Stage 2: run Next.js (`next start`), expose port 3000

**App (static):**
- Stage 1: build Vite (`vite build`)
- Stage 2: `nginx:alpine` or `caddy:alpine` serving `dist/` with SPA fallback (`try_files $uri /index.html`)

**Admin (static):**
- Same pattern as App, different source directory

### 10.3 Coolify Deployment Config

| Service | Type | Build | Start Command | Domain |
|---|---|---|---|---|
| marketing | Dockerfile | Multi-stage | `npm run start` | yourdomain.com |
| app | Dockerfile | Static + nginx | N/A (nginx) | yourdomain.com/app/* |
| api-http | Dockerfile | Multi-stage | `npm run start:http` | api.yourdomain.com |
| api-ws | Dockerfile | Multi-stage | `npm run start:ws` | api.yourdomain.com/ws/* |
| admin | Dockerfile | Static + nginx | N/A (nginx) | admin.yourdomain.com |
| postgres | Managed | Coolify-managed | N/A | Internal only |
| redis | Managed | Coolify-managed | N/A | Internal only |

### 10.4 Traefik Routing

**Path-based routing for app SPA:**
- Rule: `Host(yourdomain.com) && PathPrefix(/app/)`
- Middleware: none (no strip-prefix — the app's base path is `/app/`)
- Vite config: set `base: '/app/'` so all asset paths are prefixed correctly
- Nginx config: `location /app/ { try_files $uri /app/index.html; }` for SPA client-side routing

**WebSocket routing:**
- Rule: `Host(api.yourdomain.com) && PathPrefix(/ws/)`
- Middleware: none
- Traefik automatically handles WebSocket upgrade when the backend responds with 101

**SSL:**
- Let's Encrypt via Traefik's built-in ACME resolver
- Automatic certificate renewal
- HTTP → HTTPS redirect on all domains

**Marketing vs App priority:**
- Marketing catches all `yourdomain.com/*` EXCEPT `/app/*`
- Traefik rule priority: app rule (more specific PathPrefix) takes precedence over marketing (no PathPrefix)

### 10.5 Environment Variables

**Root `.env.example`:**

```
# Shared
NODE_ENV=development
BASE_DOMAIN=localhost

# Database
DATABASE_URL=postgresql://cityroam:cityroam@localhost:5432/cityroam

# Redis
REDIS_URL=redis://localhost:6379

# API
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=hello@yourdomain.com
DEEPSEEK_API_KEY=sk-...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=cityroam-assets
AWS_REGION=eu-west-2
AWS_CDN_BASE_URL=https://cdn.yourdomain.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
SESSION_SECRET=random-secret-for-jwt
COOKIE_DOMAIN=.localhost
REVIEW_LINK=https://g.page/r/your-google-review-link/review

# Marketing
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_POSTHOG_KEY=phc_...
MARKETING_URL=http://localhost:3000

# App
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3002
VITE_POSTHOG_KEY=phc_...

# Admin
VITE_ADMIN_API_URL=http://localhost:3001
```

**Startup validation** (API process):
- On startup, validate all required env vars are present
- Missing vars: log clear error listing each missing var name, then `process.exit(1)`
- Required vars for HTTP process: DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, RESEND_API_KEY, DEEPSEEK_API_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_REGION, ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET, COOKIE_DOMAIN, REVIEW_LINK
- Required vars for WS process: DATABASE_URL, REDIS_URL, COOKIE_DOMAIN

### 10.6 Database Operations
- Migration command: `npm run migrate` (runs Drizzle Kit push/migrate from `packages/api`)
- Seed command: `npm run seed` (inserts message bank entries from Spec 02 §2.3)
- Both runnable standalone (for CI/deploy) or via docker-compose exec
- Backup strategy: daily pg_dump via Coolify's built-in backup or external cron

### 10.7 Health Checks
- API HTTP: GET `/health` → 200 with `{ status: "ok", db: "ok", redis: "ok" }` (see Spec 03 §3.9)
- Coolify health check configuration: poll `/health` every 30s, unhealthy after 3 failures
- PostgreSQL: Coolify-managed health check
- Redis: Coolify-managed health check

### 10.8 SPA Routing for Static Apps
Both the `app` and `admin` packages are SPAs with client-side routing. The static file server (nginx) must return `index.html` for all routes that don't match a static file.

**App nginx config:**
```
server {
  listen 80;
  root /usr/share/nginx/html;
  location /app/ {
    try_files $uri /app/index.html;
  }
}
```

**Admin nginx config:**
```
server {
  listen 80;
  root /usr/share/nginx/html;
  location / {
    try_files $uri /index.html;
  }
}
```

## Dependencies
- All other specs (this wraps everything for deployment)

## Backend Tests
- Health check endpoint returns 200 when services healthy, 503 when DB or Redis down
- Environment variable validation: missing required var causes process exit with clear error
