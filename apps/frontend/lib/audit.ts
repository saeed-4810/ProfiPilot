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
