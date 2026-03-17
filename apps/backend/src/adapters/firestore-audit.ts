import { randomUUID } from "node:crypto";
import { getFirebaseApp } from "../lib/firebase.js";
import { AuditStatus, AuditJobSchema, type AuditJob } from "../domain/audit.js";

const COLLECTION = "audits";

/** Create a new audit job document in Firestore. Returns the created AuditJob. */
export async function createAuditJob(uid: string, url: string): Promise<AuditJob> {
  const firestore = getFirebaseApp().firestore();
  const jobId = randomUUID();
  const now = new Date().toISOString();

  const job: AuditJob = {
    jobId,
    uid,
    url,
    status: AuditStatus.QUEUED,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await firestore.collection(COLLECTION).doc(jobId).set(job);
  return job;
}

/** Read an audit job document from Firestore. Returns null if not found. */
export async function getAuditJob(jobId: string): Promise<AuditJob | null> {
  const firestore = getFirebaseApp().firestore();
  const doc = await firestore.collection(COLLECTION).doc(jobId).get();

  if (!doc.exists) {
    return null;
  }

  // Runtime validation guards against corrupt Firestore data (W5)
  const parsed = AuditJobSchema.safeParse(doc.data());
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

/**
 * Update the status of an audit job. Sets updatedAt and optionally completedAt.
 * Supports optional retryCount and lastError for retry/failure transitions per ADR-006.
 */
export async function updateAuditStatus(
  jobId: string,
  status: AuditStatus,
  options?: { retryCount?: number; lastError?: string; nextRetryAt?: string }
): Promise<void> {
  const firestore = getFirebaseApp().firestore();
  const now = new Date().toISOString();

  const update: Record<string, string | number> = {
    status,
    updatedAt: now,
  };

  if (status === AuditStatus.COMPLETED || status === AuditStatus.FAILED) {
    update["completedAt"] = now;
  }

  if (options?.retryCount !== undefined) {
    update["retryCount"] = options.retryCount;
  }

  if (options?.lastError !== undefined) {
    update["lastError"] = options.lastError;
  }

  if (options?.nextRetryAt !== undefined) {
    update["nextRetryAt"] = options.nextRetryAt;
  }

  await firestore.collection(COLLECTION).doc(jobId).update(update);
}
