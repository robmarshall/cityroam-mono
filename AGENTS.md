# Agents Guide

## Build Commands

```bash
# Run all services in parallel (postgres/redis must be running)
npm run dev

# Individual services
npm run dev:marketing   # Next.js marketing site (port 3000)
npm run dev:app         # Vite player SPA (port 5173)
npm run dev:api         # API HTTP + WS servers
npm run dev:api:http    # API HTTP only (port 3001)
npm run dev:api:ws      # API WebSocket only (port 3002)
npm run dev:admin       # Admin panel (port 5174)

# Build, test, typecheck all packages
npm run build
npm test
npm run typecheck

# Database
npm run migrate
npm run seed
npm run seed:message-banks

# Docker
npm run docker:build    # Build and start all containers
npm run docker:shell    # Shell into dev container
npm run docker:down     # Stop containers
npm run docker:migrate  # Run migrations in container
npm run docker:seed     # Seed database in container
```

## Package Structure

- `packages/shared` — Shared TypeScript types, Zod validation, constants, utilities (`@cityroam/shared`)
- `packages/api` — Hono HTTP + WebSocket servers, Drizzle ORM, Redis, Stripe, AI pipeline (`@cityroam/api`)
- `packages/app` — Vite + React 19 player-facing SPA (`@cityroam/app`)
- `packages/admin` — Vite + React 19 admin panel (`@cityroam/admin`)
- `packages/marketing` — Next.js 15 marketing/checkout site (`@cityroam/marketing`)
