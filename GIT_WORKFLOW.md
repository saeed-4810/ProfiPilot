# PrefPilot — Git Workflow & Developer Responsibilities

This document defines per-developer git ownership, skill assignments, and branching responsibilities for the monorepo. It is the ground-truth reference for code reviews, branch protection configuration, and Jira ticket assignment.

For the full contribution guide (commit format, hooks, PR rules), see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Repository structure reminder

```
prefpilot/
  apps/
    backend/     @prefpilot/backend  — Alex owns
    frontend/    @prefpilot/frontend — Nina owns
  .github/
    workflows/   CI pipeline         — Alex owns
  tsconfig.base.json                 — Alex + Nina shared review
  eslint.config.js                   — Alex + Nina shared review
  package.json / pnpm-workspace.yaml — Alex owns
```

---

## Developer skill & workspace assignments

### Alex — Lead Engineer & Architect

| Dimension              | Detail                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary workspace      | `apps/backend/`, `/.github/`, root tooling                                                                                                                |
| Languages              | Node.js + TypeScript                                                                                                                                      |
| Owns                   | API implementation, Firebase Admin, DB migrations, CI/CD pipeline, infra runbook                                                                          |
| Branch prefix          | `feat/PERF-xxx-*`, `fix/PERF-xxx-*`, `ci/PERF-xxx-*`, `chore/PERF-xxx-*`                                                                                  |
| Commit scope           | `backend`, `ci`, `root`, `deps`                                                                                                                           |
| Mandatory reviewer for | All `apps/backend/**` PRs, all `.github/**` PRs, all shared tooling PRs (`tsconfig.base.json`, `eslint.config.js`, `package.json`, `pnpm-workspace.yaml`) |
| Release gate role      | Must approve `develop` → `main` promotion                                                                                                                 |
| DoD gate               | All backend ACs pass; API contract rows verified against API Spec v1 (PERF-93); T-\* scenarios defined and passing                                        |

### Nina — Frontend & UX Engineer

| Dimension              | Detail                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Primary workspace      | `apps/frontend/`                                                                                                                       |
| Languages              | Next.js + TypeScript + React, Framer Motion                                                                                            |
| Owns                   | UI implementation, UX flows, Framer Motion animations, reduced-motion fallback, shell routes                                           |
| Branch prefix          | `feat/PERF-xxx-*`, `fix/PERF-xxx-*`, `chore/PERF-xxx-*`                                                                                |
| Commit scope           | `frontend`, `docs`, `deps`                                                                                                             |
| Mandatory reviewer for | All `apps/frontend/**` PRs                                                                                                             |
| DoD gate               | All UX ACs pass; U-\* scenarios defined and passing; Framer Motion + `prefers-reduced-motion` wired; shell pages render without errors |

### Omar — AI & Quality Engineer

| Dimension              | Detail                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Primary workspace      | Both workspaces (test files)                                                              |
| Languages              | TypeScript (test utilities, AI evaluation)                                                |
| Owns                   | Test strategy, QA scenario-to-test mapping, AI prompt testing, regression suite           |
| Branch prefix          | `test/PERF-xxx-*`, `fix/PERF-xxx-*`                                                       |
| Commit scope           | `backend`, `frontend`, `docs`                                                             |
| Mandatory reviewer for | All PRs touching `*.test.ts`, `*.spec.ts`, or AI-related files                            |
| DoD gate               | 100% P/U/T scenario coverage confirmed; all T-\* test IDs mapped to actual test artifacts |

### Mo — Scrum Master & Delivery Lead

| Dimension              | Detail                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Primary workspace      | Process governance (no direct code ownership)                                          |
| Owns                   | Sprint board hygiene, branch protection enforcement, release gate signoff              |
| Branch prefix          | N/A — no feature branches                                                              |
| Mandatory reviewer for | All `develop` → `main` release PRs                                                     |
| DoD gate               | DoR/DoD checklist satisfied; Jira + Confluence hygiene confirmed; Decision Log updated |

---

## Branch lifecycle

```
main (protected, production)
  └── develop (protected, integration / staging)
        └── feat/PERF-106-backend-workspace
        └── feat/PERF-105-frontend-workspace
        └── fix/PERF-98-auth-token-refresh
        └── test/PERF-97-qa-coverage

hotfix/PERF-xxx-critical-bug  →  main (+ cherry-pick to develop)
```

### Flow for normal feature work

1. Cut branch from `develop`: `git checkout -b feat/PERF-xxx-<slug> develop`
2. Make commits (commitlint enforces format on each commit).
3. Push and open PR targeting `develop`.
4. CI runs; CODEOWNERS auto-assigns reviewer.
5. Reviewer approves; author squash-merges.
6. Delete branch; update Jira ticket status.

### Flow for a release to `main`

1. QA confirms all P0 scenarios pass on `develop`.
2. Mo approves DoD checklist.
3. Alex opens PR from `develop` → `main`; Alex + Mo must approve.
4. Squash merge. Tag the release: `v0.x.0`.

### Flow for a hotfix

1. Cut branch from `main`: `git checkout -b hotfix/PERF-xxx-<slug> main`
2. Fix, commit, push.
3. Open PR → `main`; Alex must approve.
4. After merge, cherry-pick or open a second PR to `develop`.
5. Notify Mo immediately.

---

## Code review expectations

### For authors

- Keep PRs small and focused (one ticket = one PR as a rule).
- Fill in the PR template before requesting review.
- Resolve all CI failures before requesting review.
- Do not merge your own PR.

### For reviewers

- Respond within 1 business day.
- Use GitHub suggestion comments for small fixes.
- Approve only when all checklist items pass and you are satisfied the code is correct, safe, and aligned with the relevant ADR/contract row.
- Request changes for: security issues, contract violations, missing tests, broken DoD gates.

### Review scope by role

| Reviewer | Must check                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Alex     | Contract alignment (API Spec, DB schema), error handling, auth behavior, TypeScript correctness, security   |
| Nina     | UI states (loading/error/empty), accessibility, Framer Motion correctness, copy alignment with UX Copy Bank |
| Omar     | Test coverage for changed behavior, T-\* scenario IDs mapped, no missing edge cases                         |
| Mo       | PR title convention, Jira ticket linked, DoD satisfied before merge                                         |

---

## Commit hook bypass policy

Bypassing hooks with `--no-verify` is **not permitted** without written approval.

| Hook                       | Bypass allowed? | Approval required               |
| -------------------------- | --------------- | ------------------------------- |
| `pre-commit` (lint-staged) | Emergency only  | Alex or Mo + Decision Log entry |
| `commit-msg` (commitlint)  | Never           | —                               |
| `pre-push` (typecheck)     | Emergency only  | Alex + Decision Log entry       |

Unapproved bypasses must be corrected in a follow-up commit before the PR is reviewed.
