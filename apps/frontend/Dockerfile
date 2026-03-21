# Multi-stage build for Next.js production server on Cloud Run.
# Follows the same pattern as apps/backend/Dockerfile.
# Architecture: ADR-026 §Frontend Deployment.
# CRITICAL: Do NOT add output: 'export' to next.config.mjs.
# The full Next.js server (SSR, middleware, server components) must run on Cloud Run.

# Stage 1: Install dependencies and build
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9

# Copy workspace manifests for dependency installation
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile

# Copy source and shared config
COPY tsconfig.base.json ./
COPY apps/frontend/ ./apps/frontend/

# Build arguments for NEXT_PUBLIC_* env vars (baked into client bundle at build time).
# These are NOT secrets — they are public Firebase client config.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

# Next.js collects anonymous telemetry — disable in CI/production
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @prefpilot/frontend build

# Stage 2: Production runtime (minimal image)
FROM node:20-alpine AS runtime

WORKDIR /app

RUN npm install -g pnpm@9

# Copy only what's needed for production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/frontend/package.json ./apps/frontend/
COPY --from=builder /app/apps/backend/package.json ./apps/backend/

# --ignore-scripts skips all lifecycle scripts (prepare, postinstall, etc.).
# The root "prepare" script runs "husky" which is a devDependency — not available
# with --prod. Safe to skip all scripts in the production runtime container.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy the Next.js build output
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Start the Next.js production server
CMD ["pnpm", "--filter", "@prefpilot/frontend", "start"]
