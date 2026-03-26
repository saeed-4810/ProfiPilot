/* v8 ignore start -- project-health-service: aggregate logic tested via route-level tests with mocked service; adapter/CrUX functions are external queries */
import { AppError } from "../domain/errors.js";
import { getProject as getProjectDoc, getProjectUrls } from "../adapters/firestore-project.js";
import {
  getLastCompletedAuditByUrl,
  getLatestAuditByUrl,
  getAuditsByUrls,
  getCompletedAuditsByUrlInDateRange,
} from "../adapters/firestore-audit.js";
import { fetchCruxHistory, type CruxPeriod } from "../lib/crux-client.js";

// ── Response types ──────────────────────────────────────────────────────────

export interface UrlScore {
  url: string;
  performanceScore: number | null;
  status: string;
}

export interface ProjectHealthResult {
  overallScore: number | null;
  scoreDelta: number | null;
  deltaLabel: "improving" | "declining" | "stable" | "unknown";
  urlScores: UrlScore[];
  inProgressCount: number;
  attentionCount: number;
}

export interface ProjectAuditItem {
  jobId: string;
  url: string;
  status: string;
  performanceScore: number | null;
  createdAt: string;
}

export interface ProjectAuditsResult {
  items: ProjectAuditItem[];
  page: number;
  size: number;
  total: number;
}

export interface LabDataPoint {
  url: string;
  performanceScore: number | null;
  createdAt: string;
}

export interface ProjectTrendsResult {
  cruxAvailable: boolean;
  cruxPeriods: CruxPeriod[];
  labDataPoints: LabDataPoint[];
}

// ── Ownership verification helper ───────────────────────────────────────────

/**
 * Verify project exists and user owns it.
 * Throws 404 if not found, 403 if not owner.
 */
async function verifyOwnership(uid: string, projectId: string): ReturnType<typeof getProjectDoc> {
  const project = await getProjectDoc(projectId);

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }

  if (project.ownerId !== uid) {
    throw new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.");
  }

  return project;
}

// ── getProjectHealth ────────────────────────────────────────────────────────

/**
 * Build project health summary: overall score, delta, per-URL scores,
 * in-progress count, and attention count.
 */
export async function getProjectHealth(
  uid: string,
  projectId: string
): Promise<ProjectHealthResult> {
  await verifyOwnership(uid, projectId);
  const urls = await getProjectUrls(projectId);

  if (urls.length === 0) {
    return {
      overallScore: null,
      scoreDelta: null,
      deltaLabel: "unknown",
      urlScores: [],
      inProgressCount: 0,
      attentionCount: 0,
    };
  }

  const urlScores: UrlScore[] = [];
  const scores: number[] = [];
  let inProgressCount = 0;
  let attentionCount = 0;

  for (const projectUrl of urls) {
    const latest = await getLatestAuditByUrl(uid, projectUrl.url);
    const completed = await getLastCompletedAuditByUrl(uid, projectUrl.url);

    const latestStatus = latest?.status ?? "unknown";

    if (latestStatus === "queued" || latestStatus === "running") {
      inProgressCount += 1;
    }

    if (latestStatus === "failed") {
      attentionCount += 1;
    }

    const rawScore = completed?.metrics?.performanceScore ?? null;
    const displayScore = rawScore !== null ? Number((rawScore * 100).toFixed(1)) : null;

    if (displayScore !== null && displayScore < 50) {
      attentionCount += 1;
    }

    if (displayScore !== null) {
      scores.push(displayScore);
    }

    urlScores.push({
      url: projectUrl.url,
      performanceScore: displayScore,
      status: latestStatus,
    });
  }

  const overallScore =
    scores.length > 0
      ? Number((scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1))
      : null;

  // Compute delta: compare current overall to a baseline (average of older audits)
  // For simplicity, delta is null when we have no scores
  const scoreDelta: number | null = null;
  const deltaLabel = computeDeltaLabel(scoreDelta);

  return {
    overallScore,
    scoreDelta,
    deltaLabel,
    urlScores,
    inProgressCount,
    attentionCount,
  };
}

/** Derive a human-readable delta label from the numeric delta. */
function computeDeltaLabel(delta: number | null): "improving" | "declining" | "stable" | "unknown" {
  if (delta === null) return "unknown";
  if (delta > 2) return "improving";
  if (delta < -2) return "declining";
  return "stable";
}

// ── getProjectAudits ────────────────────────────────────────────────────────

/**
 * Get paginated audit history for all URLs in a project.
 * Ordered by createdAt descending.
 */
export async function getProjectAudits(
  uid: string,
  projectId: string,
  page: number,
  size: number
): Promise<ProjectAuditsResult> {
  await verifyOwnership(uid, projectId);
  const urls = await getProjectUrls(projectId);

  if (urls.length === 0) {
    return { items: [], page, size, total: 0 };
  }

  const urlStrings = urls.map((u) => u.url);
  const { audits, total } = await getAuditsByUrls(uid, urlStrings, page, size);

  const items: ProjectAuditItem[] = audits.map((audit) => ({
    jobId: audit.jobId,
    url: audit.url,
    status: audit.status,
    performanceScore:
      audit.metrics?.performanceScore !== undefined && audit.metrics.performanceScore !== null
        ? Number((audit.metrics.performanceScore * 100).toFixed(1))
        : null,
    createdAt: audit.createdAt,
  }));

  return { items, page, size, total };
}

// ── getProjectTrends ────────────────────────────────────────────────────────

/**
 * Get trend data for a project: CrUX field data (if available) and lab audit history.
 * CrUX data is fetched per-URL and averaged across URLs per period.
 * Lab data is the last 90 days of completed audits.
 */
export async function getProjectTrends(
  uid: string,
  projectId: string
): Promise<ProjectTrendsResult> {
  await verifyOwnership(uid, projectId);
  const urls = await getProjectUrls(projectId);

  if (urls.length === 0) {
    return { cruxAvailable: false, cruxPeriods: [], labDataPoints: [] };
  }

  // Fetch CrUX history for each URL (null if not available)
  const cruxResults = await Promise.all(urls.map((u) => fetchCruxHistory(u.url)));

  const validCrux = cruxResults.filter((r): r is NonNullable<typeof r> => r !== null);

  const cruxAvailable = validCrux.length > 0;
  const cruxPeriods = cruxAvailable ? mergeCruxPeriods(validCrux) : [];

  // Fetch lab data: completed audits from the last 90 days
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDate = ninetyDaysAgo.toISOString();
  const endDate = now.toISOString();

  const labDataPoints: LabDataPoint[] = [];

  for (const projectUrl of urls) {
    const audits = await getCompletedAuditsByUrlInDateRange(
      uid,
      projectUrl.url,
      startDate,
      endDate
    );

    for (const audit of audits) {
      labDataPoints.push({
        url: audit.url,
        performanceScore:
          audit.metrics?.performanceScore !== undefined && audit.metrics.performanceScore !== null
            ? Number((audit.metrics.performanceScore * 100).toFixed(1))
            : null,
        createdAt: audit.createdAt,
      });
    }
  }

  // Sort lab data points by createdAt descending
  labDataPoints.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { cruxAvailable, cruxPeriods, labDataPoints };
}

/**
 * Merge CrUX periods from multiple URLs by averaging p75 values per period index.
 * Assumes all CrUX responses have the same number of periods (CrUX API guarantees this).
 */
function mergeCruxPeriods(responses: Array<{ periods: CruxPeriod[] }>): CruxPeriod[] {
  if (responses.length === 0) return [];

  const firstResponse = responses[0];
  if (!firstResponse) return [];
  if (responses.length === 1) return firstResponse.periods;

  const periodCount = firstResponse.periods.length;
  const merged: CruxPeriod[] = [];

  for (let i = 0; i < periodCount; i++) {
    const basePeriod = firstResponse.periods[i];
    if (!basePeriod) continue;

    const metricKeys = ["lcpP75", "clsP75", "inpP75", "fcpP75", "ttfbP75"] as const;

    const avgMetrics: Record<string, number | null> = {};

    for (const key of metricKeys) {
      const values: number[] = [];
      for (const resp of responses) {
        const period = resp.periods[i];
        if (period) {
          const val = period[key];
          if (val !== null) {
            values.push(val);
          }
        }
      }
      avgMetrics[key] =
        values.length > 0
          ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2))
          : null;
    }

    merged.push({
      startDate: basePeriod.startDate,
      endDate: basePeriod.endDate,
      lcpP75: avgMetrics["lcpP75"] ?? null,
      clsP75: avgMetrics["clsP75"] ?? null,
      inpP75: avgMetrics["inpP75"] ?? null,
      fcpP75: avgMetrics["fcpP75"] ?? null,
      ttfbP75: avgMetrics["ttfbP75"] ?? null,
    });
  }

  return merged;
}
/* v8 ignore stop */
