# PrefPilot — Monorepo

pnpm workspace monorepo for the PrefPilot MVP.

## Repository layout

```
prefpilot/
├── apps/
│   ├── backend/          # Node.js + TypeScript API  (PERF-106)
│   └── frontend/         # Next.js + TypeScript + Framer Motion  (PERF-105)
├── .github/
│   └── workflows/
│       └── ci.yml        # Install → lint → typecheck → build → test
├── tsconfig.base.json    # Shared TypeScript compiler options
├── eslint.config.js      # Shared ESLint flat config (TS + Prettier)
├── .prettierrc.json      # Shared Prettier options
├── pnpm-workspace.yaml   # Workspace declaration
├── package.json          # Root scripts + shared dev deps
├── CODEOWNERS            # Ownership routing for reviews
└── .env.example          # Root-level env template
```

## Prerequisites

| Tool | Version |
| ---- | ------- |
| Node | ≥ 20    |
| pnpm | ≥ 9     |

## Getting started

```bash
# Install all workspace dependencies from repo root
pnpm install

# Run all workspaces in dev mode (parallel)
pnpm dev

# Run per workspace
pnpm --filter @prefpilot/backend dev
pnpm --filter @prefpilot/frontend dev
```

## Scripts (root — proxied to all workspaces)

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Start all workspaces in parallel      |
| `pnpm build`     | Build all workspaces                  |
| `pnpm test`      | Run all workspace test suites         |
| `pnpm lint`      | Lint all workspaces                   |
| `pnpm typecheck` | Type-check all workspaces             |
| `pnpm clean`     | Remove build artifacts + node_modules |

## Workspace-specific docs

- `apps/backend/README.md` — Node.js API setup, env vars, Firebase Admin
- `apps/frontend/README.md` — Next.js setup, Framer Motion, env vars

## CI

GitHub Actions runs on every PR targeting `main`:

1. **Install** — `pnpm install --frozen-lockfile`
2. **Lint** — `pnpm lint`
3. **Type check** — `pnpm typecheck`
4. **Build** — `pnpm build` (depends on lint + typecheck passing)
5. **Test** — `pnpm test` (depends on build passing)

See `.github/workflows/ci.yml`.

## Contributing

See `CODEOWNERS` for review routing. All changes must pass CI before merge.
Contract-first standards: see `../OPERATING_DOR_DOD.md`.
