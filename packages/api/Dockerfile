# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

# Install all dependencies
RUN npm ci --workspace=packages/shared --workspace=packages/api --include-workspace-root

# Copy shared source (exports point to src/ directly, no build step)
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/

# Copy API source and build
COPY packages/api/src packages/api/src
COPY packages/api/tsconfig.json packages/api/
COPY packages/api/drizzle.config.ts packages/api/

RUN npm run build --workspace=packages/api

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy root workspace config for npm workspace resolution
COPY package.json package-lock.json ./

# Copy package manifests
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

# Install production dependencies only
RUN npm ci --workspace=packages/shared --workspace=packages/api --include-workspace-root --omit=dev

# Copy shared source (consumed directly from src/)
COPY --from=builder /app/packages/shared/src packages/shared/src

# Copy API built output
COPY --from=builder /app/packages/api/dist packages/api/dist

# Copy drizzle migrations (needed for db:migrate at runtime)
COPY packages/api/drizzle packages/api/drizzle
COPY packages/api/drizzle.config.ts packages/api/

# Run from packages/api so relative paths (./drizzle) resolve correctly
WORKDIR /app/packages/api

EXPOSE 3001

# Default to HTTP server; override with CMD for WS
CMD ["node", "dist/http/index.js"]
