/**
 * Project detail API client — PERF-167.
 *
 * Fetches project health, audit history, and trend data for the
 * project overview page. Follows the same pattern as lib/projects.ts
 * and lib/dashboard.ts (ADR-018 Tier 2 fetch, credentials: "include").
 *
 * API contracts defined in ADR-029.
 */

const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/* ------------------------------------------------------------------ */
/* Response interfaces — match ADR-029 API contracts (PERF-166)        */
/* ------------------------------------------------------------------ */

/** Per-URL score in the health response. */
export interface UrlScore {
  readonly urlId: string;
  readonly url: string;
  readonly label: string;
  readonly score: number | null;
  readonly lastAuditDate: string | null;
}

/** Response from GET /api/v1/projects/:id/health. */
export interface ProjectHealthResponse {
  readonly projectId: string;
  readonly overallScore: number | null;
  readonly scoreDelta: number | null;
  readonly deltaLabel: string;
  readonly urlScores: readonly UrlScore[];
  readonly inProgressCount: number;
  readonly attentionCount: number;
  readonly computedAt: string;
}

/** Single audit item in the audit history response. */
export interface AuditItem {
  readonly auditId: string;
  readonly url: string;
  readonly performanceScore: number | null;
  readonly status: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/** Response from GET /api/v1/projects/:id/audits. */
export interface ProjectAuditsResponse {
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly items: readonly AuditItem[];
}

/** Single CrUX period in the trends response. */
export interface CruxPeriod {
  readonly startDate: string;
  readonly endDate: string;
  readonly lcpP75: number | null;
  readonly clsP75: number | null;
  readonly inpP75: number | null;
}

/** Single lab data point in the trends response. */
export interface LabDataPoint {
  readonly date: string;
  readonly lcp: number | null;
  readonly cls: number | null;
  readonly tbt: number | null;
  readonly performanceScore: number | null;
}

/** Response from GET /api/v1/projects/:id/trends. */
export interface ProjectTrendsResponse {
  readonly projectId: string;
  readonly cruxAvailable: boolean;
  readonly cruxPeriods: readonly CruxPeriod[];
  readonly labDataPoints: readonly LabDataPoint[];
}

/* ------------------------------------------------------------------ */
/* Approved copy from docs/ux/003-copy-bank.md                        */
/* ------------------------------------------------------------------ */

// copy: project-overview-error
export const COPY_PROJECT_DETAIL_ERROR = "Failed to load project data. Please try again.";

// copy: project-overview-not-found
export const COPY_PROJECT_NOT_FOUND = "Project not found.";

// copy: project-overview-no-audits
export const COPY_NO_AUDITS = "No audits yet. Run your first audit to see results here.";

// copy: project-overview-no-urls
export const COPY_NO_URLS = "No URLs added yet. Add a URL to start tracking performance.";

// copy: project-overview-no-crux
export const COPY_NO_CRUX =
  "This site doesn't have enough real-user traffic for field data trends. Run audits regularly for lab data trends.";

// copy: project-overview-heading
export const COPY_HEALTH_HEADING = "Overall Project Health";

// copy: project-overview-trends-heading
export const COPY_TRENDS_HEADING = "30-Day Performance Trends";

// copy: project-overview-audit-heading
export const COPY_AUDIT_LOG_HEADING = "Audit Log";

// copy: project-overview-endpoint-heading
export const COPY_ENDPOINT_HEADING = "Endpoint Registry";

// copy: project-overview-start-audit
export const COPY_START_AUDIT = "Start New Project Audit";

// copy: project-overview-view-report
export const COPY_VIEW_REPORT = "View Report";

// copy: project-overview-run-audit
export const COPY_RUN_AUDIT = "Run Audit";

// copy: project-overview-field-legend
export const COPY_FIELD_LEGEND = "Field data (real users)";

// copy: project-overview-lab-legend
export const COPY_LAB_LEGEND = "Lab data (Lighthouse)";

/* ------------------------------------------------------------------ */
/* Error helper — enriched Error with status + code                   */
/* ------------------------------------------------------------------ */

/** API error envelope per ADR-003. */
interface ApiError {
  readonly status: number;
  readonly code: string;
  readonly message?: string;
}

function throwApiError(response: Response, error: ApiError, fallbackMessage: string): never {
  const err = new Error(error.message ?? fallbackMessage) as Error & {
    status: number;
    code: string;
  };
  err.status = response.status;
  err.code = error.code ?? "UNKNOWN";
  throw err;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Classify a performance score (0-100) into a badge variant.
 * Green ≥90, amber ≥50, red <50 — per ADR-029 §3a.
 */
export function classifyScore(score: number | null): "success" | "warning" | "error" | "neutral" {
  if (score === null) return "neutral";
  if (score >= 90) return "success";
  if (score >= 50) return "warning";
  return "error";
}

/**
 * Format a score delta into a display string with arrow.
 * Positive → "↑ +4.2%", negative → "↓ -2.1%", zero/null → "—".
 */
export function formatDelta(delta: number | null): {
  text: string;
  direction: "up" | "down" | "neutral";
} {
  if (delta === null || delta === 0) return { text: "—", direction: "neutral" };
  if (delta > 0) return { text: `+${delta.toFixed(1)}%`, direction: "up" };
  return { text: `${delta.toFixed(1)}%`, direction: "down" };
}

/* ------------------------------------------------------------------ */
/* API functions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch project health data.
 * GET /api/v1/projects/:id/health with session cookie.
 */
export async function getProjectHealth(projectId: string): Promise<ProjectHealthResponse> {
  const response = await fetch(`${API_BASE}/api/v1/projects/${projectId}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_PROJECT_DETAIL_ERROR);
  }

  return (await response.json()) as ProjectHealthResponse;
}

/**
 * Fetch project audit history.
 * GET /api/v1/projects/:id/audits with session cookie.
 */
export async function getProjectAudits(
  projectId: string,
  page = 1,
  size = 20
): Promise<ProjectAuditsResponse> {
  const response = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/audits?page=${page}&size=${size}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_PROJECT_DETAIL_ERROR);
  }

  return (await response.json()) as ProjectAuditsResponse;
}

/**
 * Fetch project trend data (CrUX + lab).
 * GET /api/v1/projects/:id/trends with session cookie.
 */
export async function getProjectTrends(projectId: string): Promise<ProjectTrendsResponse> {
  const response = await fetch(`${API_BASE}/api/v1/projects/${projectId}/trends`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_PROJECT_DETAIL_ERROR);
  }

  return (await response.json()) as ProjectTrendsResponse;
}
