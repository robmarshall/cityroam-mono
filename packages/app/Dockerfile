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

# Copy app source and build
COPY packages/app/src packages/app/src
COPY packages/app/tsconfig.json packages/app/
COPY packages/app/vite.config.ts packages/app/
COPY packages/app/index.html packages/app/

RUN npm run build --workspace=packages/app

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html/app

# Copy nginx config with SPA fallback
COPY packages/app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
