# Contributing to PrefPilot

This document is the authoritative reference for all developers contributing to the monorepo. It covers branch naming, commit messages, local hooks, PR rules, and merge strategy.

All standards here are enforced by automated tooling (Husky, commitlint, lint-staged, GitHub branch protection). Non-compliant commits and PRs are rejected automatically.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Local setup](#2-local-setup)
3. [Branch naming](#3-branch-naming)
4. [Commit messages](#4-commit-messages)
5. [Local git hooks](#5-local-git-hooks)
6. [Pull request rules](#6-pull-request-rules)
7. [Merge strategy](#7-merge-strategy)
8. [Branch protection](#8-branch-protection)
9. [Per-developer responsibilities](#9-per-developer-responsibilities)

---

## 1. Prerequisites

| Tool | Version |
| ---- | ------- |
| Node | ≥ 20    |
| pnpm | ≥ 9     |
| Git  | ≥ 2.40  |

---

## 2. Local setup

```bash
# Clone and install — Husky hooks are installed automatically via `prepare`
git clone <repo-url> prefpilot
cd prefpilot
pnpm install
```

After `pnpm install`, the following hooks are active in `.husky/`:

| Hook         | Trigger               | What it runs     |
| ------------ | --------------------- | ---------------- |
| `pre-commit` | Before every commit   | `lint-staged`    |
| `commit-msg` | After writing message | `commitlint`     |
| `pre-push`   | Before every push     | `pnpm typecheck` |

---

## 3. Branch naming

Format: `<type>/<ticket-id>-<kebab-slug>`

```
feat/PERF-106-backend-workspace
feat/PERF-105-frontend-workspace
fix/PERF-98-auth-token-refresh
chore/PERF-107-ci-cache-path
test/PERF-97-qa-coverage-matrix
docs/PERF-80-update-contributing
refactor/PERF-101-auth-service-extract
ci/PERF-107-pnpm-cache-fix
hotfix/PERF-xxx-critical-billing-bug
```

### Allowed types

| Type       | When to use                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or enhancement                 |
| `fix`      | Bug fix                                    |
| `chore`    | Maintenance, tooling, dependency updates   |
| `docs`     | Documentation only                         |
| `test`     | Adding or updating tests                   |
| `refactor` | Code restructuring without behavior change |
| `ci`       | CI/CD pipeline changes                     |
| `hotfix`   | Critical fix targeting `main` directly     |

### Rules

- Branch name must include the Jira ticket ID (`PERF-xxx`).
- Slugs are lowercase kebab-case.
- Never work directly on `main` or `develop`.
- Delete branches after the PR is merged.

---

## 4. Commit messages

Format: `<type>(<scope>): <subject>`

```
feat(backend): add health endpoint for liveness probe
fix(frontend): correct reduced-motion hook import path
chore(deps): upgrade framer-motion to 11.2.0
ci(root): propagate pnpm store path from setup job output
docs(root): add contributing guide and PR template
test(backend): add smoke test for health endpoint
```

### Allowed scopes

| Scope      | What it covers                                    |
| ---------- | ------------------------------------------------- |
| `backend`  | `apps/backend/` changes                           |
| `frontend` | `apps/frontend/` changes                          |
| `root`     | Root-level files (`package.json`, tsconfig, etc.) |
| `ci`       | `.github/workflows/` changes                      |
| `docs`     | Documentation files (CONTRIBUTING, README, etc.)  |
| `deps`     | Dependency version bumps                          |

### Rules

- Subject is lowercase, no period at end, max 100 characters.
- Scope is mandatory (enforced by commitlint warning).
- Breaking changes: append `!` after scope and add a `BREAKING CHANGE:` footer.

```
feat(backend)!: rename userId field to accountId

BREAKING CHANGE: All API consumers must update the `userId` field to `accountId`.
Affects CTR-001, CTR-003.
```

---

## 5. Local git hooks

Hooks run automatically via Husky. **Do not bypass them with `--no-verify`** unless explicitly approved by Alex (architecture) or Mo (delivery) and documented in the Decision Log.

### `pre-commit` — lint-staged

Runs ESLint (with auto-fix) and Prettier on all staged files before the commit is recorded.

Covered extensions: `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.json`, `.md`, `.yaml`, `.yml`

### `commit-msg` — commitlint

Validates the commit message against the Conventional Commits standard and the allowed scope list. Rejects the commit if the message is malformed.

### `pre-push` — typecheck

Runs `pnpm typecheck` (recursive TypeScript type check across all workspaces) before any push. Push is blocked if type errors exist.

---

## 6. Pull request rules

### Target branches

| Source branch type                                                     | Target    | Notes                               |
| ---------------------------------------------------------------------- | --------- | ----------------------------------- |
| `feat/*`, `fix/*`, `chore/*`, `docs/*`, `test/*`, `refactor/*`, `ci/*` | `develop` | All day-to-day work                 |
| `develop`                                                              | `main`    | Release promotion (sprint end)      |
| `hotfix/*`                                                             | `main`    | Critical fix, notify Mo immediately |

### Required reviewers

| Changed paths                                                                                       | Required reviewer(s) |
| --------------------------------------------------------------------------------------------------- | -------------------- |
| `apps/backend/**`                                                                                   | Alex                 |
| `apps/frontend/**`                                                                                  | Nina                 |
| `.github/**`                                                                                        | Alex                 |
| `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `package.json`, `pnpm-workspace.yaml` | Alex + Nina          |
| Any `*.test.ts` or `*.spec.ts` file                                                                 | Omar                 |
| `develop` → `main` (release)                                                                        | Alex + Mo            |
| `hotfix/*` → `main`                                                                                 | Alex (Mo notified)   |

Reviewers are auto-assigned via [CODEOWNERS](CODEOWNERS).

### PR checklist (enforced)

- [ ] Branch name follows `<type>/PERF-xxx-<slug>`
- [ ] PR title follows `<type>(<scope>): <subject>` (same as commit convention)
- [ ] Jira ticket ID is referenced in the PR description
- [ ] CI passes (all 5 jobs: install, lint, typecheck, build, test)
- [ ] No unresolved review comments before merge
- [ ] Self-review is not allowed (author cannot approve their own PR)
- [ ] Branch is up-to-date with target before merge

### PR title

PR titles must follow the same Conventional Commits format as commit messages. The squash-merge commit is derived from the PR title.

```
feat(backend): implement authentication middleware (PERF-101)
fix(frontend): resolve Framer Motion import on SSR (PERF-98)
```

---

## 7. Merge strategy

**Squash merge only** for all PRs into `develop` and `main`.

- This keeps the `develop` and `main` history linear and clean.
- The squash commit message is taken from the PR title — ensure the PR title is correct before merging.
- Rebase-merge and merge commits are disabled on the repository.

After merge:

- Delete the source branch.
- Close the associated Jira ticket (or move to the next status as per workflow).

---

## 8. Branch protection

### `main`

| Rule                              | Setting               |
| --------------------------------- | --------------------- |
| Direct push                       | Blocked               |
| Required status checks            | All CI jobs must pass |
| Required approvals                | 2 (Alex + Mo)         |
| Dismiss stale reviews on new push | Enabled               |
| Require up-to-date branch         | Enabled               |
| Delete branch on merge            | Enabled               |
| Allow force push                  | Disabled              |

### `develop`

| Rule                              | Setting               |
| --------------------------------- | --------------------- |
| Direct push                       | Blocked               |
| Required status checks            | All CI jobs must pass |
| Required approvals                | 1 (CODEOWNERS)        |
| Dismiss stale reviews on new push | Enabled               |
| Require up-to-date branch         | Enabled               |
| Delete branch on merge            | Enabled               |
| Allow force push                  | Disabled              |

---

## 9. Per-developer responsibilities

See [GIT_WORKFLOW.md](GIT_WORKFLOW.md) for the full developer-to-workspace-to-reviewer matrix.

| Developer | Primary workspace                          | Typical branch prefix | Mandatory reviewer for                                |
| --------- | ------------------------------------------ | --------------------- | ----------------------------------------------------- |
| Alex      | `apps/backend`, `/.github`, shared tooling | `feat/PERF-xxx-*`     | All backend PRs, all CI/infra PRs, shared tooling PRs |
| Nina      | `apps/frontend`                            | `feat/PERF-xxx-*`     | All frontend PRs                                      |
| Omar      | Both (test files only)                     | `test/PERF-xxx-*`     | PRs touching `*.test.ts` / `*.spec.ts` files          |
| Mo        | Process governance                         | N/A                   | All `develop` → `main` release PRs                    |
