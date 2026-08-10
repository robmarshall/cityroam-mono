# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY packages/shared/package.json packages/shared/
COPY packages/marketing/package.json packages/marketing/

# Install all dependencies
RUN npm ci --workspace=packages/shared --workspace=packages/marketing --include-workspace-root

# Copy shared source (exports point to src/ directly, no build step)
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/

# Copy marketing source
COPY packages/marketing/src packages/marketing/src
COPY packages/marketing/tsconfig.json packages/marketing/
COPY packages/marketing/next.config.ts packages/marketing/
COPY packages/marketing/next-env.d.ts packages/marketing/
COPY packages/marketing/postcss.config.mjs packages/marketing/
COPY packages/marketing/public packages/marketing/public

# Build Next.js with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=packages/marketing

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output
COPY --from=builder /app/packages/marketing/.next/standalone ./
COPY --from=builder /app/packages/marketing/.next/static ./packages/marketing/.next/static
COPY --from=builder /app/packages/marketing/public ./packages/marketing/public

EXPOSE 3000

CMD ["node", "packages/marketing/server.js"]
