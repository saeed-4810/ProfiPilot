# [APPROVED] Decision Log Entry — Build W12 Board Checkpoint

<a id="approved-decision-log-entry-build-w12-board-checkpoint"></a>

# \[APPROVED\] Decision Log Entry — Build W12 Board Checkpoint

**Decision date:** 2026-03-10  
**Owner:** Mo  
**Supporting:** Sara  
**Related task:** Task PERF-46, Task PERF-38

<a id="referenced-board-pack"></a>

## Referenced board pack

- [Weekly Board Review Pack (Build W12)](../approved-build-domain-board-governance/approved-weekly-boar.md)
- Board pack version referenced for this decision entry: **v13**

<a id="decision-options"></a>

## Decision options

- Option A: GO constrained build + HOLD paid pilot
- Option B: HOLD all build execution

<a id="decision-thresholds-pass-fail"></a>

## Decision thresholds (pass/fail)

1. First-party demand proof >=5 commitments and >=5 pricing quotes (PERF-40, PERF-41)
2. Legal/tax closure memo + blocker severity and owner plan (PERF-37)
3. Runtime QA pass with no P0/P1 blockers in [QA Checklist](../../approved-phase-2-build-workspace/approved-build-domain-architecture-quality/approved-test-strate.md)

<a id="decision-outcome"></a>

## Decision outcome

**Selected:** Option A — GO constrained build + HOLD paid pilot.

<a id="rationale"></a>

## Rationale

- Scope lock and product clarity are already passed.
- Build artifacts are complete enough for constrained execution.
- Paid-pilot evidence thresholds are not yet met.

<a id="follow-up-actions"></a>

## Follow-up actions

- James: deliver first-party interview and pricing evidence updates (PERF-40, PERF-41) by 2026-03-17.
- Niels: deliver legal/tax closure packet updates (PERF-37) by 2026-03-17.
- Omar + Alex: post runtime QA pass/fail evidence summary in QA checklist by 2026-03-17.

---

# Decision Log Entry — PERF-100 E-AUDIT-003 Deferral

**Decision date:** 2026-03-17  
**Owner:** Alex  
**Supporting:** Mo, Omar  
**Related task:** PERF-100

## Context

PERF-100 implements the backend audit trigger and status lifecycle (POST /audits, GET /audits/:id/status). The E2E scenario E-AUDIT-003 ("Preference audit submission triggers engine state") requires a frontend audit form with URL input, submit button, and progress indicator — none of which exist yet. The frontend audit page is currently a shell placeholder.

## Decision

**Defer E-AUDIT-003 to the frontend audit form implementation ticket.** E-AUDIT-003 remains as a `test.fixme` stub in `apps/frontend/e2e/audit.spec.ts` and will be activated when the frontend audit form is implemented.

## Rationale

- E-AUDIT-003 is a frontend E2E test that requires UI components not yet built.
- PERF-100 scope is backend-only: API routes, service layer, Firestore adapter, domain types.
- All backend T-\* scenarios (T-PERF-100-001 through T-PERF-100-005) pass with 100% code coverage.
- E-AUDIT-001 and E-AUDIT-002 (shell page tests) pass.
- Blocking PERF-100 backend closure on a frontend E2E test would delay the critical path.

## Follow-up

- Create frontend audit form ticket that includes E-AUDIT-003 activation as an acceptance criterion.
- E-AUDIT-003 must pass before the full audit feature (backend + frontend) can be considered Done.

---

# Decision Log Entry — PERF-100 ADR-003 Service-Adapter Direct Import

**Decision date:** 2026-03-17  
**Owner:** Alex  
**Related task:** PERF-100

## Context

ADR-003 states "Services must not import from routes or adapters directly (use dependency injection or adapter interfaces)." The PERF-100 audit service (`src/services/audit-service.ts`) directly imports from the Firestore adapter (`src/adapters/firestore-audit.ts`).

## Decision

**Accept direct import for MVP.** Introducing adapter interfaces adds abstraction overhead that is not justified for a single adapter implementation. The service layer correctly isolates business logic from the route handler, which is the primary architectural goal.

## Conditions for revisiting

- When a second adapter implementation is needed (e.g., switching from Firestore to PostgreSQL).
- When unit testing the service layer in isolation (without Firestore mock) becomes a requirement.
- When ADR-003 is formally amended to clarify the DI requirement for MVP scope.
