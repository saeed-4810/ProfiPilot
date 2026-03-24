import { randomUUID } from "node:crypto";
import { getFirebaseApp } from "../lib/firebase.js";
import {
  AuditStatus,
  AuditJobSchema,
  type AuditJob,
  type AuditMetrics,
  type AuditStrategy,
} from "../domain/audit.js";

const COLLECTION = "audits";

/** Create a new audit job document in Firestore. Returns the created AuditJob. */
export async function createAuditJob(
  uid: string,
  url: string,
  strategy: AuditStrategy = "mobile"
): Promise<AuditJob> {
  const firestore = getFirebaseApp().firestore();
  const jobId = randomUUID();
  const now = new Date().toISOString();

  const job: AuditJob = {
    jobId,
    uid,
    url,
    status: AuditStatus.QUEUED,
    strategy,
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

  // Default strategy to "mobile" for pre-ADR-012 documents missing the field
  return { ...parsed.data, strategy: parsed.data.strategy ?? "mobile" };
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

/* v8 ignore start -- PERF-144: getLastCompletedAuditByUrl — Firestore query, tested via E2E */
/**
 * Find the most recent completed audit for a given URL and user.
 * Returns null if no completed audit exists.
 * Used by GET /audits/latest?url=... for dashboard health preview (PERF-144).
 *
 * Uses uid + createdAt index (always available) and filters url + status in code.
 * This avoids requiring a 4-field composite index that may not be built yet.
 */
export async function getLastCompletedAuditByUrl(
  uid: string,
  url: string
): Promise<AuditJob | null> {
  const firestore = getFirebaseApp().firestore();

  // Query by uid + createdAt (existing index), filter url + status in code
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  if (snapshot.empty) return null;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data["url"] !== url) continue;
    if (data["status"] !== AuditStatus.COMPLETED) continue;

    const parsed = AuditJobSchema.safeParse(data);
    if (!parsed.success) continue;

    return { ...parsed.data, strategy: parsed.data.strategy ?? "mobile" };
  }

  return null;
}
/* v8 ignore stop */

/** Write parsed CWV metrics to the audit document's metrics subdocument per ADR-012. */
export async function updateAuditMetrics(jobId: string, metrics: AuditMetrics): Promise<void> {
  const firestore = getFirebaseApp().firestore();
  const now = new Date().toISOString();

  await firestore.collection(COLLECTION).doc(jobId).update({
    metrics,
    updatedAt: now,
  });
}
