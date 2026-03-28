# Stage 1: Build
FROM node:20-alpine AS builder

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

# Copy admin source and build
COPY packages/admin/src packages/admin/src
COPY packages/admin/tsconfig.json packages/admin/
COPY packages/admin/vite.config.ts packages/admin/
COPY packages/admin/index.html packages/admin/

RUN npm run build --workspace=packages/admin

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/packages/admin/dist /usr/share/nginx/html/admin

# Copy nginx config with SPA fallback
COPY packages/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
