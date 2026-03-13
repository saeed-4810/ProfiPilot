# @prefpilot/backend

Node.js + TypeScript API for PrefPilot. Part of the pnpm monorepo at `../../`.

## Prerequisites

| Tool | Version |
| ---- | ------- |
| Node | ≥ 20    |
| pnpm | ≥ 9     |

## Getting started

```bash
# From monorepo root
pnpm install

# Copy env template and fill in values
cp apps/backend/.env.example apps/backend/.env

# Start dev server (hot-reload via tsx watch)
pnpm --filter @prefpilot/backend dev
```

## Scripts

| Command                                      | Description                      |
| -------------------------------------------- | -------------------------------- |
| `pnpm --filter @prefpilot/backend dev`       | Start dev server with hot-reload |
| `pnpm --filter @prefpilot/backend build`     | Compile TypeScript to `dist/`    |
| `pnpm --filter @prefpilot/backend test`      | Run Vitest test suite            |
| `pnpm --filter @prefpilot/backend lint`      | ESLint (zero warnings policy)    |
| `pnpm --filter @prefpilot/backend typecheck` | TypeScript type-check (no emit)  |
| `pnpm --filter @prefpilot/backend clean`     | Remove `dist/`                   |

## Directory layout

```
apps/backend/
  src/
    index.ts          Entry point — Express app + server bind
    routes/
      health.ts       GET /health handler
    lib/
      firebase.ts     Firebase Admin SDK initialization
  tests/
    health.test.ts    Smoke test for health endpoint
  dist/               Compiled output (git-ignored)
  Dockerfile          Multi-stage production image
  tsconfig.json       Extends ../../tsconfig.base.json
  vitest.config.ts    Test runner configuration
  .env.example        Required env vars (no secrets)
```

## Secrets policy

- **`.env` must never be committed.** It is git-ignored at the monorepo root.
- `.env.example` is the only env artifact in source control.
- In CI/staging/production, use Application Default Credentials (ADC) for Firebase.
- For local development, populate `FIREBASE_SERVICE_ACCOUNT_JSON` in your local `.env`.

## Environment variables

| Variable                        | Required | Description                             |
| ------------------------------- | -------- | --------------------------------------- |
| `PORT`                          | No       | HTTP port (default: `3001`)             |
| `NODE_ENV`                      | No       | `development` \| `test` \| `production` |
| `FIREBASE_PROJECT_ID`           | Yes      | Firebase project identifier             |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No       | Service account JSON string (local dev) |

## API endpoints

| Method | Path      | Description                                 | Auth |
| ------ | --------- | ------------------------------------------- | ---- |
| GET    | `/health` | Liveness probe — returns `{ status: "ok" }` | None |

## Handoff notes (F1/F3/F5 touchpoints)

The following feature lanes depend on this workspace being complete:

- **PERF-101 (F1 — Auth):** Will add `POST /auth/verify-token` and Firebase Auth middleware. Extend `src/routes/auth.ts` and `src/middleware/requireAuth.ts`.
- **PERF-100 (F3 — Audit trigger):** Will add `POST /audits` and the Lighthouse/CWV job queue. Extend `src/routes/audits.ts` and `src/lib/queue.ts`.
- **PERF-103 (F5 — Export/Billing):** Will add `POST /export` and billing guard middleware. Extend `src/routes/export.ts`.

TypeScript module system: NodeNext (ESM). Use `.js` extensions in all relative imports within `src/`.
