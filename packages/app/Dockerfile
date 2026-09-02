# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY packages/shared/package.json packages/shared/
COPY packages/app/package.json packages/app/

# Install all dependencies
RUN npm ci --workspace=packages/shared --workspace=packages/app --include-workspace-root

# Copy shared source (exports point to src/ directly, no build step)
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/

# Copy app source
COPY packages/app/src packages/app/src
COPY packages/app/tsconfig.json packages/app/
COPY packages/app/vite.config.ts packages/app/
COPY packages/app/index.html packages/app/

# Vite inlines `import.meta.env.VITE_*` at BUILD time, so every public value the
# app reads must be supplied as a build arg. Without them the bundle keeps its
# localhost fallbacks (e.g. ws://localhost:3002) and the deployed app is dead.
# Enumerated from `import.meta.env.VITE_` across packages/app/src.
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ARG VITE_REVIEW_LINK

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ENV VITE_REVIEW_LINK=$VITE_REVIEW_LINK

# Fail the build rather than ship a bundle pointing at localhost.
RUN if [ -z "$VITE_API_URL" ]; then echo "ERROR: build arg VITE_API_URL is required" >&2; exit 1; fi
RUN if [ -z "$VITE_WS_URL" ]; then echo "ERROR: build arg VITE_WS_URL is required" >&2; exit 1; fi

RUN npm run build --workspace=packages/app

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html/app

# Copy nginx config with SPA fallback
COPY packages/app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
