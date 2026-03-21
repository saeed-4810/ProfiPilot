const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/* ------------------------------------------------------------------ */
/* Response interfaces — match API spec CTR-007, CTR-008 (PERF-117)   */
/* ------------------------------------------------------------------ */

/** Severity levels for recommendations, ordered P0 (critical) → P3 (low). */
export type Severity = "P0" | "P1" | "P2" | "P3";

/** A single recommendation from GET /audits/:id/recommendations (CTR-007). */
export interface Recommendation {
  ruleId: string;
  metric: string;
  severity: Severity;
  category: string;
  currentValue: string;
  targetValue: string;
  suggestedFix: string;
  evidence: string;
}

/** Response from GET /audits/:id/recommendations (CTR-007). */
export interface RecommendationsResponse {
  auditId: string;
  recommendations: Recommendation[];
}

/** A dev ticket from the AI summary. */
export interface DevTicket {
  title: string;
  description: string;
  priority: Severity;
  category: string;
  metric: string;
  currentValue: string;
  targetValue: string;
  estimatedImpact: string;
  suggestedFix: string;
}

/** Response from GET /audits/:id/summary when AI is available (CTR-008). */
export interface SummaryResponse {
  auditId: string;
  executiveSummary: string | null;
  tickets: DevTicket[];
  modelVersion?: string;
  promptHash?: string;
  generatedAt?: string;
  aiAvailable: boolean;
  fallbackReason?: string;
}

/** API error envelope per ADR-003. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
}

/* ------------------------------------------------------------------ */
/* Approved copy from docs/ux/003-copy-bank.md                        */
/* ------------------------------------------------------------------ */

// copy: results-load-failed
export const COPY_RESULTS_LOAD_FAILED = "Failed to load results. Please try again.";

// copy: ai-unavailable-banner
export const COPY_AI_UNAVAILABLE = "AI summary temporarily unavailable.";

// copy: audit-not-found
export const COPY_AUDIT_NOT_FOUND = "Audit not found.";

// copy: audit-not-completed
export const COPY_AUDIT_NOT_COMPLETED = "Audit still processing. Please wait and try again.";

// copy: results-empty
export const COPY_RESULTS_EMPTY = "No issues found — your site is performing great!";

/* ------------------------------------------------------------------ */
/* Severity sort order — P0 first, P3 last                            */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Sort recommendations by severity (P0 → P3). */
export function sortBySeverity<T extends { severity: Severity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Sort dev tickets by priority (P0 → P3). */
export function sortByPriority<T extends { priority: Severity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.priority] - SEVERITY_ORDER[b.priority]);
}

/* ------------------------------------------------------------------ */
/* Error helper — enriched Error with status + code                   */
/* ------------------------------------------------------------------ */

function throwApiError(response: Response, error: ApiError, fallbackMessage: string): never {
  const err = new Error(error.message || fallbackMessage) as Error & {
    status: number;
    code: string;
  };
  err.status = response.status;
  err.code = error.code ?? "UNKNOWN";
  throw err;
}

/* ------------------------------------------------------------------ */
/* API functions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch recommendations for a completed audit.
 * GET /audits/:id/recommendations with session cookie (credentials: "include").
 */
export async function getRecommendations(auditId: string): Promise<RecommendationsResponse> {
  const response = await fetch(`${API_BASE}/audits/${auditId}/recommendations`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_RESULTS_LOAD_FAILED);
  }

  return (await response.json()) as RecommendationsResponse;
}

/**
 * Fetch AI-generated summary and dev ticket backlog for a completed audit.
 * GET /audits/:id/summary with session cookie (credentials: "include").
 * Handles both aiAvailable: true and aiAvailable: false responses.
 */
export async function getSummary(auditId: string): Promise<SummaryResponse> {
  const response = await fetch(`${API_BASE}/audits/${auditId}/summary`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_RESULTS_LOAD_FAILED);
  }

  return (await response.json()) as SummaryResponse;
}

/* ------------------------------------------------------------------ */
/* Badge variant mapping for severity levels                          */
/* ------------------------------------------------------------------ */

type BadgeVariant = "error" | "warning" | "info" | "neutral";

const SEVERITY_BADGE_VARIANT: Record<Severity, BadgeVariant> = {
  P0: "error",
  P1: "warning",
  P2: "info",
  P3: "neutral",
};

/** Get the Badge variant for a severity level. */
export function getSeverityBadgeVariant(severity: Severity): BadgeVariant {
  return SEVERITY_BADGE_VARIANT[severity];
}
