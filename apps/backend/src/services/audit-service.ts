import { AppError } from "../domain/errors.js";
import type { AuditJob, AuditStatus } from "../domain/audit.js";
import { createAuditJob as createJob, getAuditJob } from "../adapters/firestore-audit.js";

/** Response shape for POST /audits (CTR-005). */
export interface CreateAuditResult {
  jobId: string;
  status: AuditStatus;
  createdAt: string;
}

/** Response shape for GET /audits/:id/status (CTR-006). */
export interface AuditStatusResult {
  jobId: string;
  status: AuditStatus;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
  lastError?: string | undefined;
}

/**
 * Create a new audit job for the authenticated user.
 * Delegates persistence to the Firestore adapter.
 */
export async function createAudit(uid: string, url: string): Promise<CreateAuditResult> {
  const job = await createJob(uid, url);

  return {
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
  };
}

/**
 * Retrieve audit job status for the authenticated user.
 * Enforces owner-only access: throws 404 if not found, 403 if uid mismatch.
 */
export async function getAuditStatus(uid: string, jobId: string): Promise<AuditStatusResult> {
  const job: AuditJob | null = await getAuditJob(jobId);

  if (!job) {
    throw new AppError(404, "AUDIT_NOT_FOUND", "Audit job not found.");
  }

  if (job.uid !== uid) {
    throw new AppError(403, "AUDIT_FORBIDDEN", "You do not have access to this audit job.");
  }

  return {
    jobId: job.jobId,
    status: job.status,
    retryCount: job.retryCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.completedAt !== undefined ? { completedAt: job.completedAt } : {}),
    ...(job.lastError !== undefined ? { lastError: job.lastError } : {}),
  };
}
