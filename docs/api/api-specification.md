# API Specification

**Owner:** Alex  
**Supporting:** Omar  
**Related task:** PERF-32, PERF-33, PERF-34, PERF-100, PERF-101, PERF-117  
**Version:** 3 (updated 2026-03-19 — PERF-117 recommendation + summary endpoints)  
**Change note:** Added CTR-007 (GET /audits/:id/recommendations), CTR-008 (GET /audits/:id/summary), and POST /audits/:id/recommendations/regenerate as implemented endpoints. Added error codes AUDIT_NOT_COMPLETED, AUDIT_CONFLICT, RECOMMENDATION_FETCH_FAILED, SUMMARY_FETCH_FAILED, REGENERATE_FAILED. Previous version added audit endpoints (v2).

<a id="global-contract"></a>

## Global contract

- Auth: Firebase session cookie (`__session`) — HTTP-only, Secure, SameSite=Strict, 5-day expiry per ADR-010.
- Error model (ADR-003):

```json
{
  "status": 401,
  "code": "AUTH_NO_SESSION",
  "message": "User-safe message",
  "details": {},
  "traceId": "uuid"
}
```

- Pagination (planned):

```json
{ "page": 1, "size": 20, "total": 125, "items": [] }
```

<a id="endpoint-contracts"></a>

## Endpoint contracts

### Implemented endpoints

---

#### POST /auth/verify-token (CTR-001) — PERF-101

- Request: `{idToken: string}`
- Response `200`: `{status: "authenticated", uid: string}` + sets `__session` cookie
- Errors: `400 VALIDATION_ERROR`, `401 AUTH_TOKEN_INVALID`, `401 AUTH_TOKEN_STALE`
- Auth: none (this is the login endpoint)

#### GET /auth/session (CTR-002) — PERF-101

- Response `200`: `{status: "valid", uid: string}`
- Errors: `401 AUTH_NO_SESSION`, `401 AUTH_SESSION_INVALID`
- Auth: session cookie required

#### POST /auth/logout (CTR-002) — PERF-101

- Response `200`: `{status: "logged_out"}` + clears `__session` cookie
- Semantics: revokes refresh tokens; always returns 200 even if no session exists
- Auth: none (best-effort revocation)

#### POST /audits (CTR-005) — PERF-100

- Request: `{url: string}` — must be valid HTTPS URL (Zod validated)
- Response `202`: `{jobId: string, status: "queued", createdAt: string}`
- Errors: `400 VALIDATION_ERROR` (with field-level details), `401 AUTH_NO_SESSION`, `401 AUTH_SESSION_INVALID`, `500 AUDIT_CREATE_FAILED`
- Auth: session cookie required (requireAuth middleware)
- SLA: response <1s

#### GET /audits/:id/status (CTR-006) — PERF-100

- Response `200`: `{jobId, status, retryCount, createdAt, updatedAt, completedAt?, lastError?}`
- Errors: `401 AUTH_NO_SESSION`, `403 AUDIT_FORBIDDEN` (not owner), `404 AUDIT_NOT_FOUND`, `500 AUDIT_STATUS_FAILED`
- Auth: session cookie required (requireAuth middleware)
- Owner-only: uid from session must match job uid
- Terminal statuses: `completed|failed|cancelled`

#### GET /health

- Response `200`: `{status: "ok"}`
- Auth: none

#### GET /audits/:id/recommendations (CTR-007) — PERF-117

- Response `200`: `{auditId: string, recommendations: [{ruleId, metric, severity, category, currentValue, targetValue, suggestedFix, evidence: {threshold, actual, delta}}]}`
- Errors: `400 AUDIT_NOT_COMPLETED` (audit still processing), `401 AUTH_NO_SESSION`, `403 AUDIT_FORBIDDEN` (not owner), `404 AUDIT_NOT_FOUND`, `500 RECOMMENDATION_FETCH_FAILED`
- Auth: session cookie required (requireAuth middleware)
- Owner-only: uid from session must match job uid
- Source: deterministic rule engine output (ADR-007, ADR-013 Layer 1)
- Lazy generation: recommendations generated and persisted on first access

#### GET /audits/:id/summary (CTR-008) — PERF-117

- Response `200` (AI available): `{auditId, executiveSummary: string, tickets: AITicket[], modelVersion, promptHash, generatedAt, aiAvailable: true}`
- Response `200` (AI unavailable — graceful degradation): `{auditId, executiveSummary: null, tickets: RuleEngineOutput[], aiAvailable: false, fallbackReason: "openai_unavailable"|"validation_failed"|"timeout"|"rate_limited"}`
- Errors: `400 AUDIT_NOT_COMPLETED`, `401 AUTH_NO_SESSION`, `403 AUDIT_FORBIDDEN`, `404 AUDIT_NOT_FOUND`, `500 SUMMARY_FETCH_FAILED`
- Auth: session cookie required (requireAuth middleware)
- Owner-only: uid from session must match job uid
- Metadata flattened to top level (not nested in metadata object)
- Lazy generation: summary generated and persisted on first access

#### POST /audits/:id/recommendations/regenerate — PERF-117

- Response `202`: `{generationId: string, status: "queued"}`
- Errors: `400 AUDIT_NOT_COMPLETED`, `401 AUTH_NO_SESSION`, `403 AUDIT_FORBIDDEN`, `404 AUDIT_NOT_FOUND`, `409 AUDIT_CONFLICT` (active regeneration in progress), `500 REGENERATE_FAILED`
- Auth: session cookie required (requireAuth middleware)
- Owner-only: uid from session must match job uid
- Fire-and-forget: background regeneration with in-memory lock (MVP)

---

### Planned endpoints (not yet implemented)

#### GET /api/v1/projects

- Response `200`: paginated project list

#### POST /api/v1/projects

- Request: `{name,url}`
- Response `201`: `{projectId,name,url}`

<a id="get-api-v1-audits-auditid-exportformatmdpdf"></a>

#### GET /api/v1/audits/{auditId}/export?format=md|pdf

- Response `200`: binary/file link with `templateVersion`
- Error `422`: unsupported format

<a id="billing-placeholders-phase-2-baseline"></a>

### Billing placeholders (Phase 2 baseline)

- `GET /api/v1/projects/{projectId}/billing` -> current plan/status summary
- `POST /api/v1/projects/{projectId}/billing/plan` -> assign/update single pilot plan

<a id="audit-lifecycle-contract"></a>

## Audit lifecycle contract

Allowed transitions:

- `queued -> running`
- `running -> completed|failed|retrying`
- `retrying -> running|failed`
- `queued|running|retrying -> cancelled`

Retry max = 3. Timeout -> `failed` with `code=TIMEOUT`.

<a id="error-code-catalog"></a>

## Error code catalog

### Implemented error codes

- `AUTH_NO_SESSION` — no session cookie present (401)
- `AUTH_SESSION_INVALID` — session cookie expired or invalid (401)
- `AUTH_TOKEN_INVALID` — Firebase ID token invalid or expired (401)
- `AUTH_TOKEN_STALE` — Firebase ID token too old for session creation (401)
- `VALIDATION_ERROR` — request body failed Zod validation (400)
- `AUDIT_NOT_FOUND` — audit job does not exist (404)
- `AUDIT_FORBIDDEN` — user does not own this audit job (403)
- `AUDIT_CREATE_FAILED` — Firestore write failed during audit creation (500)
- `AUDIT_STATUS_FAILED` — Firestore read failed during status retrieval (500)
- `AUDIT_NOT_COMPLETED` — audit is still processing, results not yet available (400)
- `AUDIT_CONFLICT` — a regeneration is already in progress for this audit (409)
- `RECOMMENDATION_FETCH_FAILED` — unexpected error fetching recommendations (500)
- `SUMMARY_FETCH_FAILED` — unexpected error fetching summary (500)
- `REGENERATE_FAILED` — unexpected error queuing regeneration (500)
- `INTERNAL_ERROR` — unhandled server error (500)

### Planned error codes (not yet implemented)

- `PROJECT_NOT_FOUND` — project does not exist (404)
- `EXPORT_FORMAT_INVALID` — unsupported export format (422)
- `RATE_LIMITED` — too many requests (429)
