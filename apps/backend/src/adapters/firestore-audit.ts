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

/* v8 ignore start -- getLatestAuditByUrl + countInProgressAuditsByUser: Firestore queries, tested via dashboard-service unit tests */
/**
 * Find the most recent audit for a given URL and user regardless of status.
 * Returns null if no audit exists.
 */
export async function getLatestAuditByUrl(uid: string, url: string): Promise<AuditJob | null> {
  const firestore = getFirebaseApp().firestore();

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

    const parsed = AuditJobSchema.safeParse(data);
    if (!parsed.success) continue;

    return { ...parsed.data, strategy: parsed.data.strategy ?? "mobile" };
  }

  return null;
}

/** Count audits for a user where status is queued or running. */
export async function countInProgressAuditsByUser(uid: string): Promise<number> {
  const firestore = getFirebaseApp().firestore();
  const snapshot = await firestore.collection(COLLECTION).where("uid", "==", uid).get();

  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data["status"] === AuditStatus.QUEUED || data["status"] === AuditStatus.RUNNING) {
      count += 1;
    }
  }

  return count;
}
/* v8 ignore stop */

/**
 * Get paginated audit jobs for a user, ordered by createdAt descending.
 * Uses the composite index: audits(uid ASC, createdAt DESC).
 * Applies safeParse to silently skip corrupt documents (ADR-021, W5).
 * Returns audits + total count for pagination.
 */
export async function getAuditsByUser(
  uid: string,
  page: number,
  size: number
): Promise<{ audits: AuditJob[]; total: number }> {
  const firestore = getFirebaseApp().firestore();
  const collectionRef = firestore.collection(COLLECTION);

  // Count total documents for this user
  const allDocs = await collectionRef.where("uid", "==", uid).get();
  const total = allDocs.size;

  // Fetch paginated results ordered by createdAt descending
  const offset = (page - 1) * size;
  const snapshot = await collectionRef
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .offset(offset)
    .limit(size)
    .get();

  const audits: AuditJob[] = [];
  for (const doc of snapshot.docs) {
    const parsed = AuditJobSchema.safeParse(doc.data());
    if (parsed.success) {
      audits.push({ ...parsed.data, strategy: parsed.data.strategy ?? "mobile" });
    }
  }

  return { audits, total };
}

/** Write parsed CWV metrics to the audit document's metrics subdocument per ADR-012. */
export async function updateAuditMetrics(jobId: string, metrics: AuditMetrics): Promise<void> {
  const firestore = getFirebaseApp().firestore();
  const now = new Date().toISOString();

  await firestore.collection(COLLECTION).doc(jobId).update({
    metrics,
    updatedAt: now,
  });
}

/* v8 ignore start -- updateAuditDesktopMetrics: identical pattern to updateAuditMetrics (tested), only field name differs */
/** Write desktop metrics for "both" strategy audits. */
export async function updateAuditDesktopMetrics(
  jobId: string,
  desktopMetrics: AuditMetrics
): Promise<void> {
  const firestore = getFirebaseApp().firestore();
  const now = new Date().toISOString();

  await firestore.collection(COLLECTION).doc(jobId).update({
    desktopMetrics,
    updatedAt: now,
  });
}
/* v8 ignore stop */

/* v8 ignore start -- getAuditsByUrls + getCompletedAuditsByUrlInDateRange: Firestore queries, tested via project-health route-level mocks */
/**
 * Get paginated audits for a list of URLs belonging to a user.
 * Queries per-URL (Firestore doesn't support IN with >30 values + inequality),
 * then merges and paginates in memory.
 * Returns audits ordered by createdAt descending with total count.
 */
export async function getAuditsByUrls(
  uid: string,
  urls: string[],
  page: number,
  size: number
): Promise<{ audits: AuditJob[]; total: number }> {
  const firestore = getFirebaseApp().firestore();
  const allAudits: AuditJob[] = [];

  for (const url of urls) {
    const snapshot = await firestore
      .collection(COLLECTION)
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data["url"] !== url) continue;

      const parsed = AuditJobSchema.safeParse(data);
      if (parsed.success) {
        allAudits.push({ ...parsed.data, strategy: parsed.data.strategy ?? "mobile" });
      }
    }
  }

  // Deduplicate by jobId (same audit may appear if URL is in multiple queries)
  const seen = new Set<string>();
  const unique: AuditJob[] = [];
  for (const audit of allAudits) {
    if (!seen.has(audit.jobId)) {
      seen.add(audit.jobId);
      unique.push(audit);
    }
  }

  // Sort by createdAt descending
  unique.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = unique.length;
  const offset = (page - 1) * size;
  const audits = unique.slice(offset, offset + size);

  return { audits, total };
}

/**
 * Get completed audits for a URL in a date range (for lab data points).
 * Filters by uid, url, status=completed, and createdAt within range.
 */
export async function getCompletedAuditsByUrlInDateRange(
  uid: string,
  url: string,
  startDate: string,
  endDate: string
): Promise<AuditJob[]> {
  const firestore = getFirebaseApp().firestore();

  const snapshot = await firestore
    .collection(COLLECTION)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .get();

  const audits: AuditJob[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data["url"] !== url) continue;
    if (data["status"] !== AuditStatus.COMPLETED) continue;

    const createdAt = data["createdAt"] as string | undefined;
    if (!createdAt || createdAt < startDate || createdAt > endDate) continue;

    const parsed = AuditJobSchema.safeParse(data);
    if (parsed.success) {
      audits.push({ ...parsed.data, strategy: parsed.data.strategy ?? "mobile" });
    }
  }

  return audits;
}
/* v8 ignore stop */
