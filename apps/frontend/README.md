# @prefpilot/frontend

Next.js 14 + TypeScript + Framer Motion workspace — part of the PrefPilot monorepo.

Implements PERF-80 Setup B: frontend workspace scaffold.

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Monorepo root installed (`pnpm install` from `code/`)

---

## Getting started

```bash
# From monorepo root
cp apps/frontend/.env.local.example apps/frontend/.env.local
# Edit .env.local with real values

pnpm --filter @prefpilot/frontend dev
# Open http://localhost:3000
```

---

## Scripts

| Script      | Command                             | Description               |
| ----------- | ----------------------------------- | ------------------------- |
| `dev`       | `next dev --port 3000`              | Development server        |
| `build`     | `next build`                        | Production build          |
| `test`      | `vitest run`                        | Unit tests (Vitest + RTL) |
| `lint`      | `eslint app components hooks tests` | ESLint (0 warnings)       |
| `typecheck` | `tsc --noEmit`                      | TypeScript type check     |
| `clean`     | `rm -rf .next dist out`             | Remove build artefacts    |

All scripts can also be run from the monorepo root:

```bash
pnpm --filter @prefpilot/frontend <script>
```

---

## Directory layout

```
apps/frontend/
  app/
    (auth)/login/page.tsx    Shell — auth flow
    audit/page.tsx           Shell — audit flow
    dashboard/page.tsx       Shell — dashboard/project flow
    export/page.tsx          Shell — export/billing flow
    results/page.tsx         Shell — results/AI flow
    globals.css              Global styles + prefers-reduced-motion CSS
    layout.tsx               Root layout with metadata
    page.tsx                 Home → redirects to /login
  components/
    MotionWrapper.tsx        Framer Motion page wrapper (reduced motion aware)
  hooks/
    useReducedMotion.ts      Detects prefers-reduced-motion OS preference
  tests/
    components/
      MotionWrapper.test.tsx T-P105-002: MotionWrapper render tests
    hooks/
      useReducedMotion.test.ts  T-P105-001: Hook unit tests (4 scenarios)
    pages/
      shell-pages.test.tsx  T-P105-003: Shell page render tests (5 pages)
    setup.ts                 Vitest + jsdom global setup (matchMedia mock)
  .env.local.example         Environment variable template
  next.config.mjs            Next.js configuration
  tsconfig.json              TypeScript config (REQUIRED module/moduleResolution overrides)
  vitest.config.ts           Vitest configuration
```

---

## tsconfig overrides (important)

`apps/frontend/tsconfig.json` extends `../../tsconfig.base.json` but overrides:

| Setting            | Base value   | Frontend override                   | Reason                             |
| ------------------ | ------------ | ----------------------------------- | ---------------------------------- |
| `module`           | `NodeNext`   | `ESNext`                            | Next.js incompatible with NodeNext |
| `moduleResolution` | `NodeNext`   | `bundler`                           | Next.js incompatible with NodeNext |
| `jsx`              | —            | `preserve`                          | Next.js requires jsx: preserve     |
| `lib`              | `["ES2022"]` | `["dom", "dom.iterable", "esnext"]` | Browser APIs required              |

---

## Framer Motion + prefers-reduced-motion

All shell pages use `MotionWrapper` for entry animations:

- **Normal motion**: fade + slight vertical slide (`y: 10 → 0`, 300ms)
- **Reduced motion**: opacity-only fade (100ms), respecting the OS setting
- Global CSS also honours `prefers-reduced-motion: reduce`

The `useReducedMotion` hook (in `hooks/useReducedMotion.ts`) subscribes to
MediaQuery change events and keeps animations in sync with live OS changes.

---

## Secrets policy

| File                 | In git?             |
| -------------------- | ------------------- |
| `.env.local`         | NO — gitignored     |
| `.env.local.example` | YES — template only |

`NEXT_PUBLIC_*` vars are **public** and safe to expose in the browser. They are
Firebase client config values (not secret keys).

---

## Environment variables

| Variable                                   | Required | Description                  |
| ------------------------------------------ | -------- | ---------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`                 | Yes      | Backend service URL          |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | Yes      | Firebase Web API key         |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Yes      | Firebase auth domain         |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Yes      | Firebase project ID          |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Yes      | Firebase storage bucket      |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes      | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Yes      | Firebase app ID              |

---

## Handoff notes

This scaffold explicitly unblocks the following downstream tickets:

| Ticket   | Feature                           | Touchpoint                                               |
| -------- | --------------------------------- | -------------------------------------------------------- |
| PERF-98  | Authentication (F2)               | `app/(auth)/login/page.tsx` → wire Firebase Auth sign-in |
| PERF-102 | Dashboard / Project overview (F4) | `app/dashboard/page.tsx` → wire project list API         |
| PERF-101 | Results / AI Insights (F5)        | `app/results/page.tsx` → wire results API                |
| PERF-103 | Export / Billing (F5)             | `app/export/page.tsx` → wire export + billing gate       |
| PERF-100 | Audit engine frontend             | `app/audit/page.tsx` → wire audit trigger + progress     |

Each shell page includes the target ticket reference in its placeholder copy.

---

## T-\* Scenario coverage (PERF-105)

| ID         | Scenario                                                      | File                                      | Status         |
| ---------- | ------------------------------------------------------------- | ----------------------------------------- | -------------- |
| T-P105-001 | `useReducedMotion` hook returns correct boolean in all states | `tests/hooks/useReducedMotion.test.ts`    | PASS (4 tests) |
| T-P105-002 | `MotionWrapper` renders children and applies className        | `tests/components/MotionWrapper.test.tsx` | PASS (3 tests) |
| T-P105-003 | All 5 shell pages render without errors                       | `tests/pages/shell-pages.test.tsx`        | PASS (5 tests) |
| T-P105-004 | tsconfig `module`/`moduleResolution` overrides verified       | `tsconfig.json` inspection                | PASS           |
| T-P105-005 | `pnpm build` produces all 7 routes (5 shells + home + 404)    | `next build` output                       | PASS           |
