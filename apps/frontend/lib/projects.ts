const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/* ------------------------------------------------------------------ */
/* Response interfaces — match API spec CTR-003, CTR-004 (PERF-116)   */
/* ------------------------------------------------------------------ */

/** A project in the list response. */
export interface ProjectItem {
  projectId: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Response from GET /api/v1/projects (CTR-003). */
export interface ProjectListResponse {
  page: number;
  size: number;
  total: number;
  items: ProjectItem[];
}

/** Response from POST /api/v1/projects (CTR-003). */
export interface CreateProjectResponse {
  projectId: string;
  name: string;
  createdAt: string;
}

/** A URL belonging to a project. */
export interface ProjectUrl {
  urlId: string;
  projectId: string;
  url: string;
  normalizedUrl: string;
  addedAt: string;
}

/** Response from GET /api/v1/projects/:id (CTR-003). */
export interface ProjectDetailResponse {
  project: ProjectItem;
  urls: ProjectUrl[];
}

/** Response from POST /api/v1/projects/:id/urls (CTR-004). */
export interface AddUrlResponse {
  urlId: string;
  url: string;
  normalizedUrl: string;
  addedAt: string;
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

// copy: dashboard-empty-state
export const COPY_DASHBOARD_EMPTY =
  "Create your first project to start auditing your web performance.";

// copy: url-validation-error (shared with audit page)
export const COPY_URL_VALIDATION_ERROR = "Please enter a valid URL including https://";

// copy: project-name-required
export const COPY_PROJECT_NAME_REQUIRED = "Project name is required.";

// copy: project-name-too-long
export const COPY_PROJECT_NAME_TOO_LONG = "Project name must be 100 characters or fewer.";

// copy: project-created
export const COPY_PROJECT_CREATED = "Project created successfully.";

// copy: url-added
export const COPY_URL_ADDED = "URL added to project.";

// copy: url-deleted
export const COPY_URL_DELETED = "URL removed from project.";

// copy: project-load-failed
export const COPY_PROJECT_LOAD_FAILED = "Failed to load projects. Please try again.";

// copy: project-create-failed
export const COPY_PROJECT_CREATE_FAILED = "Failed to create project. Please try again.";

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
 * List projects for the authenticated user.
 * GET /api/v1/projects with session cookie (credentials: "include").
 */
export async function listProjects(page = 1, size = 20): Promise<ProjectListResponse> {
  const response = await fetch(`${API_BASE}/api/v1/projects?page=${page}&size=${size}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_PROJECT_LOAD_FAILED);
  }

  return (await response.json()) as ProjectListResponse;
}

/**
 * Create a new project.
 * POST /api/v1/projects with session cookie.
 */
export async function createProject(name: string): Promise<CreateProjectResponse> {
  const response = await fetch(`${API_BASE}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_PROJECT_CREATE_FAILED);
  }

  return (await response.json()) as CreateProjectResponse;
}

/**
 * Get project detail with URLs.
 * GET /api/v1/projects/:id with session cookie.
 */
export async function getProject(projectId: string): Promise<ProjectDetailResponse> {
  const response = await fetch(`${API_BASE}/api/v1/projects/${projectId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, "Failed to load project details.");
  }

  return (await response.json()) as ProjectDetailResponse;
}

/**
 * Add a URL to a project.
 * POST /api/v1/projects/:id/urls with session cookie.
 */
export async function addUrlToProject(projectId: string, url: string): Promise<AddUrlResponse> {
  const response = await fetch(`${API_BASE}/api/v1/projects/${projectId}/urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, "Failed to add URL.");
  }

  return (await response.json()) as AddUrlResponse;
}

/**
 * Delete a URL from a project.
 * DELETE /api/v1/projects/:id/urls/:urlId with session cookie.
 * Returns 204 No Content on success.
 */
export async function deleteUrl(projectId: string, urlId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/projects/${projectId}/urls/${urlId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, "Failed to delete URL.");
  }
}

/* ------------------------------------------------------------------ */
/* Project health data — derived from last audit (PERF-144)            */
/* ------------------------------------------------------------------ */

import type { HealthStatus } from "@/components/ui/HealthDots";

/** Health data for a project card. */
export interface ProjectHealthData {
  lcp: HealthStatus;
  cls: HealthStatus;
  tbt: HealthStatus;
  lcpValue: string | null;
  clsValue: string | null;
  tbtValue: string | null;
  lastAuditDate: string | null;
  firstUrl: string | null;
}

/* v8 ignore start -- classifyMetric + formatMetricValue + getLastAuditForProject: async API integration, tested via E2E and mocked in unit tests */

/** CWV thresholds for health dot classification. */
function classifyMetric(value: number | null, goodMax: number, poorMin: number): HealthStatus {
  if (value === null) return "unknown";
  if (value <= goodMax) return "good";
  if (value <= poorMin) return "needs-improvement";
  return "poor";
}

/** Format a raw metric value into a human-readable display string. */
function formatMetricValue(value: number | null, unit: "ms" | "s" | "score"): string | null {
  if (value === null) return null;
  if (unit === "s") return `${(value / 1000).toFixed(1)}s`;
  if (unit === "ms") return `${Math.round(value)}ms`;
  return value.toFixed(2);
}

/**
 * Fetch the last audit health data for a project.
 * Strategy: get project URLs → take first URL → GET /audits/latest?url=...
 * Returns unknown health if no URLs or no completed audits.
 */
export async function getLastAuditForProject(projectId: string): Promise<ProjectHealthData> {
  const unknown: ProjectHealthData = {
    lcp: "unknown",
    cls: "unknown",
    tbt: "unknown",
    lcpValue: null,
    clsValue: null,
    tbtValue: null,
    lastAuditDate: null,
    firstUrl: null,
  };

  try {
    const detail = await getProject(projectId);
    if (detail.urls.length === 0) return unknown;

    const firstUrl = detail.urls[0]?.url ?? null;
    if (firstUrl === null) return unknown;

    // GET /audits/latest?url=... — returns the most recent completed audit with metrics
    const response = await fetch(`${API_BASE}/audits/latest?url=${encodeURIComponent(firstUrl)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) return { ...unknown, firstUrl };

    const data = (await response.json()) as {
      completedAt?: string;
      metrics?: {
        lcp: number | null;
        cls: number | null;
        tbt: number | null;
      };
    };

    if (data.metrics === undefined) return { ...unknown, firstUrl };

    return {
      lcp: classifyMetric(data.metrics.lcp, 2500, 4000),
      cls: classifyMetric(data.metrics.cls, 0.1, 0.25),
      tbt: classifyMetric(data.metrics.tbt, 200, 600),
      lcpValue: formatMetricValue(data.metrics.lcp, "s"),
      clsValue: formatMetricValue(data.metrics.cls, "score"),
      tbtValue: formatMetricValue(data.metrics.tbt, "ms"),
      lastAuditDate: data.completedAt ?? null,
      firstUrl,
    };
  } catch {
    return unknown;
  }
}

/* v8 ignore stop */
