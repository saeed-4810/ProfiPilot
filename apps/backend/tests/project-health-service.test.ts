import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/domain/errors.js";

const mockGetProject = vi.fn();
const mockGetProjectUrls = vi.fn();
const mockGetAuditsByUrls = vi.fn();
const mockGetCompletedAuditsByUrlInDateRange = vi.fn();
const mockFetchCruxHistory = vi.fn();
const mockGetProjectHealthCache = vi.fn();
const mockSetProjectHealthCache = vi.fn();
const mockDeleteProjectHealthCache = vi.fn();
const mockGetProjectTrendsCache = vi.fn();
const mockSetProjectTrendsCache = vi.fn();
const mockDeleteProjectTrendsCache = vi.fn();

vi.mock("../src/adapters/firestore-project.js", () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
  getProjectUrls: (...args: unknown[]) => mockGetProjectUrls(...args),
}));

vi.mock("../src/adapters/firestore-audit.js", () => ({
  getAuditsByUrls: (...args: unknown[]) => mockGetAuditsByUrls(...args),
  getCompletedAuditsByUrlInDateRange: (...args: unknown[]) =>
    mockGetCompletedAuditsByUrlInDateRange(...args),
}));

vi.mock("../src/adapters/crux-history.js", () => ({
  fetchCruxHistory: (...args: unknown[]) => mockFetchCruxHistory(...args),
}));

vi.mock("../src/adapters/firestore-project-health-cache.js", () => ({
  getProjectHealthCache: (...args: unknown[]) => mockGetProjectHealthCache(...args),
  setProjectHealthCache: (...args: unknown[]) => mockSetProjectHealthCache(...args),
  deleteProjectHealthCache: (...args: unknown[]) => mockDeleteProjectHealthCache(...args),
}));

vi.mock("../src/adapters/firestore-project-trends-cache.js", () => ({
  getProjectTrendsCache: (...args: unknown[]) => mockGetProjectTrendsCache(...args),
  setProjectTrendsCache: (...args: unknown[]) => mockSetProjectTrendsCache(...args),
  deleteProjectTrendsCache: (...args: unknown[]) => mockDeleteProjectTrendsCache(...args),
}));

import {
  getProjectHealth,
  getProjectAudits,
  getProjectTrends,
  invalidateProjectCaches,
} from "../src/services/project-health-service.js";

const ownedProject = {
  projectId: "proj-1",
  ownerId: "user-123",
  name: "Project",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};

const urls = [
  {
    urlId: "url-1",
    projectId: "proj-1",
    url: "https://a.com",
    normalizedUrl: "https://a.com",
    addedAt: "2026-03-01T00:00:00.000Z",
  },
  {
    urlId: "url-2",
    projectId: "proj-1",
    url: "https://b.com",
    normalizedUrl: "https://b.com",
    addedAt: "2026-03-01T00:00:00.000Z",
  },
  {
    urlId: "url-3",
    projectId: "proj-1",
    url: "https://c.com",
    normalizedUrl: "https://c.com",
    addedAt: "2026-03-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProject.mockResolvedValue(ownedProject);
  mockGetProjectUrls.mockResolvedValue(urls);
  mockGetProjectHealthCache.mockResolvedValue(null);
  mockGetProjectTrendsCache.mockResolvedValue(null);
  mockSetProjectHealthCache.mockResolvedValue(undefined);
  mockSetProjectTrendsCache.mockResolvedValue(undefined);
  mockDeleteProjectHealthCache.mockResolvedValue(undefined);
  mockDeleteProjectTrendsCache.mockResolvedValue(undefined);
});

describe("project-health-service", () => {
  it("T-PERF-166-001: computes correct overall health and delta", async () => {
    mockGetAuditsByUrls.mockResolvedValue({
      total: 5,
      audits: [
        {
          jobId: "j1",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://a.com",
          status: "completed",
          strategy: "mobile",
          retryCount: 0,
          metrics: { performanceScore: 0.8 },
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
          completedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          jobId: "j2",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://b.com",
          status: "completed",
          strategy: "mobile",
          retryCount: 0,
          metrics: { performanceScore: 0.9 },
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
          completedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          jobId: "j3",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://c.com",
          status: "completed",
          strategy: "mobile",
          retryCount: 0,
          metrics: { performanceScore: 0.7 },
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
          completedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });
    mockGetCompletedAuditsByUrlInDateRange
      .mockResolvedValueOnce([{ metrics: { performanceScore: 0.75 } }])
      .mockResolvedValueOnce([{ metrics: { performanceScore: 0.7 } }])
      .mockResolvedValueOnce([{ metrics: { performanceScore: 0.7 } }]);

    const result = await getProjectHealth("user-123", "proj-1");

    expect(result.overallScore).toBe(80);
    expect(result.scoreDelta).toBe(8.3);
    expect(result.deltaLabel).toBe("+8.3% since last week");
    expect(result.urlScores).toHaveLength(3);
    expect(result.urlScores[0]).toMatchObject({
      urlId: "url-1",
      score: 80,
      lastAuditDate: "2026-03-20T00:00:00.000Z",
    });
    expect(mockSetProjectHealthCache).toHaveBeenCalledOnce();
  });

  it("T-PERF-166-002: handles project with no audits", async () => {
    mockGetAuditsByUrls.mockResolvedValue({ total: 0, audits: [] });
    mockGetCompletedAuditsByUrlInDateRange.mockResolvedValue([]);

    const result = await getProjectHealth("user-123", "proj-1");

    expect(result.overallScore).toBeNull();
    expect(result.scoreDelta).toBeNull();
    expect(result.deltaLabel).toBe("Not enough data");
    expect(result.urlScores).toHaveLength(3);
    expect(result.attentionCount).toBe(0);
  });

  it("T-PERF-166-006: rejects non-owner", async () => {
    mockGetProject.mockResolvedValue({ ...ownedProject, ownerId: "other-user" });
    try {
      await getProjectHealth("user-123", "proj-1");
      expect.fail("should throw");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
      const typed = error as AppError;
      expect(typed.envelope).toMatchObject({
        status: 403,
        code: "PROJECT_FORBIDDEN",
      });
    }
  });

  it("uses cached health when cache is fresh", async () => {
    mockGetProjectHealthCache.mockResolvedValue({
      projectId: "proj-1",
      overallScore: 88,
      scoreDelta: 2.5,
      deltaLabel: "+2.5% since last week",
      urlScores: [],
      inProgressCount: 0,
      attentionCount: 0,
      computedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const result = await getProjectHealth("user-123", "proj-1");

    expect(result.overallScore).toBe(88);
    expect(mockGetAuditsByUrls).not.toHaveBeenCalled();
  });

  it("returns empty cached health shape when project has no URLs", async () => {
    mockGetProjectUrls.mockResolvedValue([]);

    const result = await getProjectHealth("user-123", "proj-1");

    expect(result).toEqual({
      overallScore: null,
      scoreDelta: null,
      deltaLabel: "Not enough data",
      urlScores: [],
      inProgressCount: 0,
      attentionCount: 0,
    });
  });

  it("counts in-progress and attention states from latest audits", async () => {
    mockGetProjectUrls.mockResolvedValue(urls.slice(0, 2));
    mockGetAuditsByUrls.mockResolvedValue({
      total: 2,
      audits: [
        {
          jobId: "j1",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://a.com",
          status: "running",
          strategy: "mobile",
          retryCount: 0,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          jobId: "j2",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://b.com",
          status: "failed",
          strategy: "mobile",
          retryCount: 0,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });
    mockGetCompletedAuditsByUrlInDateRange.mockResolvedValue([]);

    const result = await getProjectHealth("user-123", "proj-1");

    expect(result.inProgressCount).toBe(1);
    expect(result.attentionCount).toBe(1);
  });

  it("uses createdAt when completedAt is missing on latest completed audit", async () => {
    mockGetProjectUrls.mockResolvedValue(urls.slice(0, 1));
    mockGetAuditsByUrls.mockResolvedValue({
      total: 1,
      audits: [
        {
          jobId: "j1",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://a.com",
          status: "completed",
          strategy: "mobile",
          retryCount: 0,
          metrics: { performanceScore: 0.8 },
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });
    mockGetCompletedAuditsByUrlInDateRange.mockResolvedValue([]);

    const result = await getProjectHealth("user-123", "proj-1");
    expect(result.urlScores[0]?.lastAuditDate).toBe("2026-03-20T00:00:00.000Z");
  });

  it("T-PERF-166-003: returns paginated project audits", async () => {
    mockGetAuditsByUrls.mockResolvedValue({
      total: 2,
      audits: [
        {
          jobId: "j1",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://a.com",
          status: "completed",
          strategy: "mobile",
          retryCount: 0,
          metrics: { performanceScore: 0.8 },
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
          completedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });

    const result = await getProjectAudits("user-123", "proj-1", 2, 10);
    expect(mockGetAuditsByUrls).toHaveBeenCalledWith(
      "user-123",
      "proj-1",
      ["https://a.com", "https://b.com", "https://c.com"],
      2,
      10
    );
    expect(result.page).toBe(2);
    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({ jobId: "j1", performanceScore: 80 });
  });

  it("returns empty paginated audits when project has no URLs", async () => {
    mockGetProjectUrls.mockResolvedValue([]);

    const result = await getProjectAudits("user-123", "proj-1", 1, 10);

    expect(result).toEqual({ items: [], page: 1, size: 10, total: 0 });
  });

  it("maps missing performanceScore to null in audit items", async () => {
    mockGetProjectUrls.mockResolvedValue(urls.slice(0, 1));
    mockGetAuditsByUrls.mockResolvedValue({
      total: 1,
      audits: [
        {
          jobId: "j3",
          uid: "user-123",
          projectId: "proj-1",
          url: "https://a.com",
          status: "failed",
          strategy: "mobile",
          retryCount: 0,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });

    const result = await getProjectAudits("user-123", "proj-1", 1, 10);
    expect(result.items[0]?.performanceScore).toBeNull();
  });

  it("T-PERF-166-004: merges CrUX and lab data", async () => {
    mockFetchCruxHistory
      .mockResolvedValueOnce({
        periods: [
          {
            startDate: "2026-02-01",
            endDate: "2026-02-07",
            lcpP75: 1000,
            clsP75: 0.1,
            inpP75: 200,
            fcpP75: 800,
            ttfbP75: 300,
          },
        ],
      })
      .mockResolvedValueOnce({
        periods: [
          {
            startDate: "2026-02-01",
            endDate: "2026-02-07",
            lcpP75: 1200,
            clsP75: 0.2,
            inpP75: 250,
            fcpP75: 900,
            ttfbP75: 400,
          },
        ],
      })
      .mockResolvedValueOnce(null);
    mockGetCompletedAuditsByUrlInDateRange
      .mockResolvedValueOnce([
        {
          createdAt: "2026-03-01T12:00:00.000Z",
          metrics: { lcp: 1000, cls: 0.1, tbt: 100, performanceScore: 0.8 },
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: "2026-03-01T13:00:00.000Z",
          metrics: { lcp: 1200, cls: 0.2, tbt: 200, performanceScore: 0.6 },
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getProjectTrends("user-123", "proj-1");

    expect(result.cruxAvailable).toBe(true);
    expect(result.cruxPeriods[0]).toMatchObject({
      lcpP75: 1100,
      clsP75: 0.15,
      inpP75: 225,
    });
    expect(result.labDataPoints[0]).toMatchObject({
      date: "2026-03-01",
      lcp: 1100,
      cls: 0.15,
      tbt: 150,
      performanceScore: 0.7,
    });
  });

  it("T-PERF-166-005: handles CrUX 404 gracefully", async () => {
    mockFetchCruxHistory.mockResolvedValue(null);
    mockGetCompletedAuditsByUrlInDateRange.mockResolvedValue([]);

    const result = await getProjectTrends("user-123", "proj-1");

    expect(result.cruxAvailable).toBe(false);
    expect(result.cruxPeriods).toEqual([]);
  });

  it("uses cached trends when cache is fresh", async () => {
    mockGetProjectTrendsCache.mockResolvedValue({
      projectId: "proj-1",
      cruxAvailable: true,
      cruxPeriods: [],
      labDataPoints: [],
      computedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const result = await getProjectTrends("user-123", "proj-1");
    expect(result.cruxAvailable).toBe(true);
    expect(mockFetchCruxHistory).not.toHaveBeenCalled();
  });

  it("returns empty trends when project has no URLs", async () => {
    mockGetProjectUrls.mockResolvedValue([]);

    const result = await getProjectTrends("user-123", "proj-1");
    expect(result).toEqual({ cruxAvailable: false, cruxPeriods: [], labDataPoints: [] });
  });

  it("T-PERF-166-007: invalidates both caches", async () => {
    await invalidateProjectCaches("proj-1");
    expect(mockDeleteProjectHealthCache).toHaveBeenCalledWith("proj-1");
    expect(mockDeleteProjectTrendsCache).toHaveBeenCalledWith("proj-1");
  });

  it("uses URL fallback for legacy audits without projectId", async () => {
    mockGetProjectUrls.mockResolvedValue(urls.slice(0, 1));
    mockGetAuditsByUrls.mockResolvedValue({
      total: 1,
      audits: [
        {
          jobId: "legacy-1",
          uid: "user-123",
          url: "https://a.com",
          status: "completed",
          strategy: "mobile",
          retryCount: 0,
          metrics: { performanceScore: 0.82 },
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
          completedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });
    mockGetCompletedAuditsByUrlInDateRange.mockResolvedValue([]);

    const result = await getProjectHealth("user-123", "proj-1");
    expect(result.overallScore).toBe(82);
    expect(result.urlScores[0]?.score).toBe(82);
  });
});
