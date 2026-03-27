# Agents Guide

## Build Commands

```bash
# Run all tests
npm test

# Build all packages (shared first, then backend, then frontend)
npm run build

# Typecheck all packages
npm run typecheck

# Run backend dev server
npm run dev:backend

# Run frontend dev server
npm run dev:frontend

# Individual package commands
npm run test:backend
npm run test:frontend
npm run build:shared
npm run build:backend
npm run build:frontend
```

## Package Structure

- packages/shared - Shared TypeScript types (@revvy/shared)
- packages/backend - Hono API server
- packages/frontend - Vite + React 19 + TanStack Query
