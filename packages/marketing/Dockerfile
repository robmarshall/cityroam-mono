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

# next-intl loads these at request time via src/i18n/request.ts; without them the
# build resolves no locale bundle and every page 500s.
COPY packages/marketing/messages packages/marketing/messages

# Static assets. Tracked via public/.gitkeep so this COPY always has a source.
COPY packages/marketing/public packages/marketing/public

# Next.js inlines `process.env.NEXT_PUBLIC_*` at BUILD time, so every public
# value must be supplied as a build arg. Enumerated from
# `process.env.NEXT_PUBLIC_` across packages/marketing/src.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_SITE_URL

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Fail the build rather than ship a bundle pointing at localhost.
RUN if [ -z "$NEXT_PUBLIC_API_URL" ]; then echo "ERROR: build arg NEXT_PUBLIC_API_URL is required" >&2; exit 1; fi
RUN if [ -z "$NEXT_PUBLIC_SITE_URL" ]; then echo "ERROR: build arg NEXT_PUBLIC_SITE_URL is required" >&2; exit 1; fi

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

# next-intl imports these by dynamic template at request time. Next's standalone
# tracer usually picks them up, but copy them explicitly so a trace miss cannot
# turn every localised page into a 500.
COPY --from=builder /app/packages/marketing/messages ./packages/marketing/messages

EXPOSE 3000

CMD ["node", "packages/marketing/server.js"]
