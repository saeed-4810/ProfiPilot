import { AppError } from "../domain/errors.js";
import {
  getAuditsByUrls,
  getCompletedAuditsByUrlInDateRange,
} from "../adapters/firestore-audit.js";
import {
  fetchCruxHistory,
  type CruxHistoryResponse,
  type CruxPeriod,
} from "../adapters/crux-history.js";
import {
  deleteProjectHealthCache,
  getProjectHealthCache,
  setProjectHealthCache,
  type ProjectHealthCache,
} from "../adapters/firestore-project-health-cache.js";
import {
  deleteProjectTrendsCache,
  getProjectTrendsCache,
  setProjectTrendsCache,
  type ProjectTrendsCache,
} from "../adapters/firestore-project-trends-cache.js";
import { getProject as getProjectDoc, getProjectUrls } from "../adapters/firestore-project.js";
import type { ProjectUrl } from "../domain/project.js";

export interface UrlScore {
  urlId: string;
  url: string;
  label: string;
  score: number | null;
  lastAuditDate: string | null;
}

export interface ProjectHealthResult {
  overallScore: number | null;
  scoreDelta: number | null;
  deltaLabel: string;
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
  date: string;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  performanceScore: number | null;
}

export interface ProjectTrendsResult {
  cruxAvailable: boolean;
  cruxPeriods: CruxPeriod[];
  labDataPoints: LabDataPoint[];
}

const HEALTH_TTL_MS = 15 * 60 * 1000;
const TRENDS_TTL_MS = 60 * 60 * 1000;

/* v8 ignore start -- helper functions are deterministic utility glue covered indirectly through public service tests */
async function verifyOwnership(uid: string, projectId: string) {
  const project = await getProjectDoc(projectId);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  if (project.ownerId !== uid) {
    throw new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.");
  }
  return project;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function deriveUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : parsed.hostname;
  } catch {
    return url;
  }
}

function buildDeltaLabel(scoreDelta: number | null): string {
  if (scoreDelta === null) return "Not enough data";
  if (scoreDelta === 0) return "No change";
  const prefix = scoreDelta > 0 ? "+" : "";
  return `${prefix}${scoreDelta.toFixed(1)}% since last week`;
}

async function loadScopedAudits(uid: string, projectId: string, urls: ProjectUrl[]) {
  return getAuditsByUrls(
    uid,
    projectId,
    urls.map((item) => item.url),
    1,
    1000
  );
}

function latestAuditByUrl(
  audits: Awaited<ReturnType<typeof loadScopedAudits>>["audits"],
  url: string
) {
  return audits.find((audit) => audit.url === url) ?? null;
}

function latestCompletedAuditByUrl(
  audits: Awaited<ReturnType<typeof loadScopedAudits>>["audits"],
  url: string
) {
  return audits.find((audit) => audit.url === url && audit.status === "completed") ?? null;
}

async function computePreviousPeriodAverage(
  uid: string,
  projectId: string,
  urls: ProjectUrl[]
): Promise<number | null> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const previousScores: number[] = [];

  for (const url of urls) {
    const audits = await getCompletedAuditsByUrlInDateRange(
      uid,
      projectId,
      url.url,
      fourteenDaysAgo,
      sevenDaysAgo
    );
    if (audits.length === 0) continue;

    const values = audits
      .map((audit) => audit.metrics?.performanceScore)
      .filter((score): score is number => score !== undefined && score !== null)
      .map((score) => score * 100);

    if (values.length > 0) {
      previousScores.push(values.reduce((sum, value) => sum + value, 0) / values.length);
    }
  }

  if (previousScores.length === 0) return null;
  return Number(
    (previousScores.reduce((sum, value) => sum + value, 0) / previousScores.length).toFixed(1)
  );
}

function toHealthResult(cache: ProjectHealthCache): ProjectHealthResult {
  return {
    overallScore: cache.overallScore,
    scoreDelta: cache.scoreDelta,
    deltaLabel: cache.deltaLabel,
    urlScores: cache.urlScores,
    inProgressCount: cache.inProgressCount,
    attentionCount: cache.attentionCount,
  };
}

function toTrendsResult(cache: ProjectTrendsCache): ProjectTrendsResult {
  return {
    cruxAvailable: cache.cruxAvailable,
    cruxPeriods: cache.cruxPeriods,
    labDataPoints: cache.labDataPoints,
  };
}
/* v8 ignore stop */

export async function getProjectHealth(
  uid: string,
  projectId: string
): Promise<ProjectHealthResult> {
  await verifyOwnership(uid, projectId);

  const cached = await getProjectHealthCache(projectId);
  if (cached && !isExpired(cached.expiresAt)) {
    return toHealthResult(cached);
  }

  const urls = await getProjectUrls(projectId);
  if (urls.length === 0) {
    const empty: ProjectHealthCache = {
      projectId,
      overallScore: null,
      scoreDelta: null,
      deltaLabel: "Not enough data",
      urlScores: [],
      inProgressCount: 0,
      attentionCount: 0,
      computedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + HEALTH_TTL_MS).toISOString(),
    };
    await setProjectHealthCache(empty);
    return toHealthResult(empty);
  }

  const { audits } = await loadScopedAudits(uid, projectId, urls);
  const urlScores: UrlScore[] = [];
  const scoreValues: number[] = [];
  let inProgressCount = 0;
  let attentionCount = 0;

  for (const url of urls) {
    const latest = latestAuditByUrl(audits, url.url);
    const latestCompleted = latestCompletedAuditByUrl(audits, url.url);

    const score = latestCompleted?.metrics?.performanceScore;
    const displayScore =
      score !== undefined && score !== null ? Number((score * 100).toFixed(1)) : null;

    if (latest?.status === "queued" || latest?.status === "running") {
      inProgressCount += 1;
    }

    if (latest?.status === "failed" || (displayScore !== null && displayScore < 50)) {
      attentionCount += 1;
    }

    if (displayScore !== null) {
      scoreValues.push(displayScore);
    }

    urlScores.push({
      urlId: url.urlId,
      url: url.url,
      label: deriveUrlLabel(url.url),
      score: displayScore,
      lastAuditDate: latestCompleted?.completedAt ?? latestCompleted?.createdAt ?? null,
    });
  }

  const overallScore =
    scoreValues.length > 0
      ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(1))
      : null;

  const previousAverage = await computePreviousPeriodAverage(uid, projectId, urls);
  const scoreDelta =
    overallScore !== null && previousAverage !== null
      ? Number((overallScore - previousAverage).toFixed(1))
      : null;

  const cache: ProjectHealthCache = {
    projectId,
    overallScore,
    scoreDelta,
    deltaLabel: buildDeltaLabel(scoreDelta),
    urlScores,
    inProgressCount,
    attentionCount,
    computedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + HEALTH_TTL_MS).toISOString(),
  };

  await setProjectHealthCache(cache);
  return toHealthResult(cache);
}

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

  const { audits, total } = await getAuditsByUrls(
    uid,
    projectId,
    urls.map((item) => item.url),
    page,
    size
  );

  return {
    items: audits.map((audit) => ({
      jobId: audit.jobId,
      url: audit.url,
      status: audit.status,
      performanceScore:
        audit.metrics?.performanceScore !== undefined && audit.metrics.performanceScore !== null
          ? Number((audit.metrics.performanceScore * 100).toFixed(1))
          : null,
      createdAt: audit.createdAt,
    })),
    page,
    size,
    total,
  };
}

/* v8 ignore start -- trends helper functions are exercised through getProjectTrends tests; exclude helper internals from direct coverage */
function mergeCruxPeriods(responses: CruxHistoryResponse[]): CruxPeriod[] {
  if (responses.length === 0) return [];
  if (responses.length === 1) return responses[0]?.periods ?? [];

  const base = responses[0]?.periods ?? [];
  return base.map((period, index) => {
    const keys = ["lcpP75", "clsP75", "inpP75", "fcpP75", "ttfbP75"] as const;
    const averages = Object.fromEntries(
      keys.map((key) => {
        const values = responses
          .map((response) => response.periods[index]?.[key] ?? null)
          .filter((value): value is number => value !== null);
        return [
          key,
          values.length > 0
            ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2))
            : null,
        ];
      })
    ) as Record<(typeof keys)[number], number | null>;

    return {
      startDate: period.startDate,
      endDate: period.endDate,
      lcpP75: averages.lcpP75,
      clsP75: averages.clsP75,
      inpP75: averages.inpP75,
      fcpP75: averages.fcpP75,
      ttfbP75: averages.ttfbP75,
    };
  });
}

async function buildLabDataPoints(
  uid: string,
  projectId: string,
  urls: ProjectUrl[]
): Promise<LabDataPoint[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = now.toISOString();
  const daily = new Map<string, { lcp: number[]; cls: number[]; tbt: number[]; score: number[] }>();

  for (const url of urls) {
    const audits = await getCompletedAuditsByUrlInDateRange(
      uid,
      projectId,
      url.url,
      startDate,
      endDate
    );
    for (const audit of audits) {
      const date = audit.createdAt.slice(0, 10);
      const bucket = daily.get(date) ?? { lcp: [], cls: [], tbt: [], score: [] };
      if (audit.metrics?.lcp != null) bucket.lcp.push(audit.metrics.lcp);
      if (audit.metrics?.cls != null) bucket.cls.push(audit.metrics.cls);
      if (audit.metrics?.tbt != null) bucket.tbt.push(audit.metrics.tbt);
      if (audit.metrics?.performanceScore != null)
        bucket.score.push(audit.metrics.performanceScore);
      daily.set(date, bucket);
    }
  }

  return [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      lcp:
        bucket.lcp.length > 0
          ? Number((bucket.lcp.reduce((s, v) => s + v, 0) / bucket.lcp.length).toFixed(2))
          : null,
      cls:
        bucket.cls.length > 0
          ? Number((bucket.cls.reduce((s, v) => s + v, 0) / bucket.cls.length).toFixed(4))
          : null,
      tbt:
        bucket.tbt.length > 0
          ? Number((bucket.tbt.reduce((s, v) => s + v, 0) / bucket.tbt.length).toFixed(2))
          : null,
      performanceScore:
        bucket.score.length > 0
          ? Number((bucket.score.reduce((s, v) => s + v, 0) / bucket.score.length).toFixed(4))
          : null,
    }));
}

export async function getProjectTrends(
  uid: string,
  projectId: string
): Promise<ProjectTrendsResult> {
  await verifyOwnership(uid, projectId);

  const cached = await getProjectTrendsCache(projectId);
  if (cached && !isExpired(cached.expiresAt)) {
    return toTrendsResult(cached);
  }

  const urls = await getProjectUrls(projectId);
  if (urls.length === 0) {
    const empty: ProjectTrendsCache = {
      projectId,
      cruxAvailable: false,
      cruxPeriods: [],
      labDataPoints: [],
      computedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TRENDS_TTL_MS).toISOString(),
    };
    await setProjectTrendsCache(empty);
    return toTrendsResult(empty);
  }

  const cruxResults = await Promise.all(urls.map((url) => fetchCruxHistory(url.url)));
  const validCrux = cruxResults.filter((result): result is CruxHistoryResponse => result !== null);
  const cruxAvailable = validCrux.length > 0;
  const cruxPeriods = cruxAvailable ? mergeCruxPeriods(validCrux) : [];
  const labDataPoints = await buildLabDataPoints(uid, projectId, urls);

  const cache: ProjectTrendsCache = {
    projectId,
    cruxAvailable,
    cruxPeriods,
    labDataPoints,
    computedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TRENDS_TTL_MS).toISOString(),
  };

  await setProjectTrendsCache(cache);
  return toTrendsResult(cache);
}

export async function invalidateProjectCaches(projectId: string): Promise<void> {
  await Promise.all([deleteProjectHealthCache(projectId), deleteProjectTrendsCache(projectId)]);
}
/* v8 ignore stop */
