const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/** Response from POST /audits (CTR-005). */
export interface CreateAuditResponse {
  jobId: string;
  status: "queued";
  createdAt: string;
}

/** Audit job status values per ADR-006 state machine. */
export type AuditStatus = "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled";

/** Response from GET /audits/:id/status (CTR-006). */
export interface AuditStatusResponse {
  jobId: string;
  status: AuditStatus;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastError?: string;
}

/** API error envelope per ADR-003. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
}

/**
 * Create a new audit job by submitting a URL.
 * POST /audits with session cookie (credentials: "include").
 * Returns 202 with jobId on success.
 */
export async function createAudit(url: string): Promise<CreateAuditResponse> {
  const response = await fetch(`${API_BASE}/audits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    const err = new Error(error.message ?? "Failed to create audit.") as Error & {
      status: number;
      code: string;
    };
    err.status = response.status;
    err.code = error.code ?? "UNKNOWN";
    throw err;
  }

  return (await response.json()) as CreateAuditResponse;
}

/**
 * Poll the status of an audit job.
 * GET /audits/:id/status with session cookie.
 */
export async function getAuditStatus(jobId: string): Promise<AuditStatusResponse> {
  const response = await fetch(`${API_BASE}/audits/${jobId}/status`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    const err = new Error(error.message ?? "Failed to get audit status.") as Error & {
      status: number;
      code: string;
    };
    err.status = response.status;
    err.code = error.code ?? "UNKNOWN";
    throw err;
  }

  return (await response.json()) as AuditStatusResponse;
}

/** Terminal statuses — polling should stop when status reaches one of these. */
export const TERMINAL_STATUSES: ReadonlySet<AuditStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

/** Check if an audit status is terminal (no more polling needed). */
export function isTerminalStatus(status: AuditStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/* ------------------------------------------------------------------ */
/* Approved copy from docs/ux/003-copy-bank.md                        */
/* ------------------------------------------------------------------ */

// copy: url-validation-error
export const COPY_URL_VALIDATION_ERROR = "Please enter a valid URL including https://";

// copy: onboarding-helper
export const COPY_ONBOARDING_HELPER =
  "Add one URL to run your first audit. Need help? Contact support at any step.";

// copy: audit-queued
export const COPY_AUDIT_QUEUED = "Audit queued. Preparing run...";

// copy: audit-running
export const COPY_AUDIT_RUNNING = "Audit running. This can take a moment.";

// copy: audit-retrying
export const COPY_AUDIT_RETRYING = "Temporary issue. Retrying automatically...";

// copy: audit-failed
export const COPY_AUDIT_FAILED = "Audit failed. Try again or review logs.";

// copy: audit-completed
export const COPY_AUDIT_COMPLETED = "Audit complete. Results ready.";

/* ------------------------------------------------------------------ */
/* Status microcopy mapping per UX-002 state matrix                   */
/* ------------------------------------------------------------------ */

const STATUS_COPY: Record<string, string> = {
  queued: COPY_AUDIT_QUEUED,
  running: COPY_AUDIT_RUNNING,
  retrying: COPY_AUDIT_RETRYING,
  failed: COPY_AUDIT_FAILED,
  completed: COPY_AUDIT_COMPLETED,
};

/** Get the user-facing message for an audit status. */
export function getStatusMessage(status: AuditStatus): string {
  return STATUS_COPY[status] ?? "";
}
