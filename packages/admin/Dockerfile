# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY packages/shared/package.json packages/shared/
COPY packages/admin/package.json packages/admin/

# Install all dependencies
RUN npm ci --workspace=packages/shared --workspace=packages/admin --include-workspace-root

# Copy shared source (exports point to src/ directly, no build step)
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/

# Copy admin source
COPY packages/admin/src packages/admin/src
COPY packages/admin/tsconfig.json packages/admin/
COPY packages/admin/vite.config.ts packages/admin/
COPY packages/admin/index.html packages/admin/

# Vite inlines `import.meta.env.VITE_*` at BUILD time, so the API origin must be
# supplied as a build arg. Enumerated from `import.meta.env.VITE_` across
# packages/admin/src.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Fail the build rather than ship a bundle pointing at localhost.
RUN if [ -z "$VITE_API_URL" ]; then echo "ERROR: build arg VITE_API_URL is required" >&2; exit 1; fi

RUN npm run build --workspace=packages/admin

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/packages/admin/dist /usr/share/nginx/html

# Copy nginx config with SPA fallback
COPY packages/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
