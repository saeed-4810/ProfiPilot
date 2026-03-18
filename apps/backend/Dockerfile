# Multi-stage build — keeps the production image lean.
# Stage 1: build TypeScript to dist/
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9

# Copy workspace manifests for dependency installation
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile

# Copy source and shared config
COPY tsconfig.base.json ./
COPY apps/backend/ ./apps/backend/

RUN pnpm --filter @prefpilot/backend build

# Stage 2: production runtime
FROM node:20-alpine AS runtime

WORKDIR /app

RUN npm install -g pnpm@9

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/frontend/package.json ./apps/frontend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

# HUSKY=0 disables the "prepare" lifecycle script which runs husky (a devDependency).
# Without this, --prod install fails because husky is not available.
RUN HUSKY=0 pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "apps/backend/dist/index.js"]
