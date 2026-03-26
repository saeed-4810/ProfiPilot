import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

vi.mock("../src/services/audit-worker.js", () => ({
  processAuditJob: vi.fn().mockResolvedValue(undefined),
}));

const mockVerifySessionCookie = vi.fn();
const mockVerifyIdToken = vi.fn();
const mockFetchCruxHistory = vi.fn();
const mockGetProjectHealthCache = vi.fn();
const mockSetProjectHealthCache = vi.fn();
const mockGetProjectTrendsCache = vi.fn();
const mockSetProjectTrendsCache = vi.fn();

vi.mock("../src/adapters/crux-history.js", () => ({
  fetchCruxHistory: (...args: unknown[]) => mockFetchCruxHistory(...args),
}));

vi.mock("../src/adapters/firestore-project-health-cache.js", () => ({
  getProjectHealthCache: (...args: unknown[]) => mockGetProjectHealthCache(...args),
  setProjectHealthCache: (...args: unknown[]) => mockSetProjectHealthCache(...args),
  deleteProjectHealthCache: vi.fn(),
}));

vi.mock("../src/adapters/firestore-project-trends-cache.js", () => ({
  getProjectTrendsCache: (...args: unknown[]) => mockGetProjectTrendsCache(...args),
  setProjectTrendsCache: (...args: unknown[]) => mockSetProjectTrendsCache(...args),
  deleteProjectTrendsCache: vi.fn(),
}));

let projectDoc: Record<string, unknown> | null;
let projectUrlDocs: Array<Record<string, unknown>>;
let auditDocs: Array<Record<string, unknown>>;

function metrics(score: number) {
  return {
    lcp: 2500,
    cls: 0.1,
    tbt: 150,
    fcp: 1000,
    ttfb: 300,
    si: 2000,
    performanceScore: score,
    lighthouseVersion: "12.0.0",
    fieldData: null,
    fetchedAt: "2026-03-20T00:00:00.000Z",
  };
}

const mockFirestore = {
  collection: vi.fn((collectionName: string) => {
    if (collectionName === "projects") {
      return {
        doc: vi.fn((_projectId: string) => ({
          get: vi
            .fn()
            .mockResolvedValue(
              projectDoc
                ? { exists: true, data: () => projectDoc }
                : { exists: false, data: () => undefined }
            ),
          collection: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              get: vi
                .fn()
                .mockResolvedValue({ docs: projectUrlDocs.map((doc) => ({ data: () => doc })) }),
            })),
          })),
        })),
      };
    }

    if (collectionName === "audits") {
      return {
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: vi
              .fn()
              .mockResolvedValue({
                docs: auditDocs.map((doc) => ({ data: () => doc })),
                empty: auditDocs.length === 0,
              }),
            limit: vi.fn(() => ({
              get: vi
                .fn()
                .mockResolvedValue({
                  docs: auditDocs.map((doc) => ({ data: () => doc })),
                  empty: auditDocs.length === 0,
                }),
            })),
          })),
          get: vi
            .fn()
            .mockResolvedValue({
              docs: auditDocs.map((doc) => ({ data: () => doc })),
              empty: auditDocs.length === 0,
            }),
        })),
      };
    }

    return {
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        update: vi.fn(),
      })),
      where: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: [] }),
        orderBy: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) })),
      })),
    };
  }),
};

vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(() => ({
      name: "mock-app",
      auth: () => ({
        verifyIdToken: mockVerifyIdToken,
        createSessionCookie: vi.fn(),
        verifySessionCookie: mockVerifySessionCookie,
        revokeRefreshTokens: vi.fn(),
      }),
      firestore: () => mockFirestore,
    })),
    credential: {
      cert: vi.fn(() => "mock-cert"),
      applicationDefault: vi.fn(() => "mock-adc"),
    },
  },
}));

const { app } = await import("../src/index.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySessionCookie.mockResolvedValue({ uid: "user-123" });
  mockGetProjectHealthCache.mockResolvedValue(null);
  mockGetProjectTrendsCache.mockResolvedValue(null);
  mockSetProjectHealthCache.mockResolvedValue(undefined);
  mockSetProjectTrendsCache.mockResolvedValue(undefined);
  mockFetchCruxHistory.mockResolvedValue(null);

  projectDoc = {
    projectId: "proj-1",
    ownerId: "user-123",
    name: "Project One",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };

  projectUrlDocs = [
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

  auditDocs = [
    {
      jobId: "j1",
      uid: "user-123",
      projectId: "proj-1",
      url: "https://a.com",
      status: "completed",
      strategy: "mobile",
      retryCount: 0,
      metrics: metrics(0.8),
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
      metrics: metrics(0.9),
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
      metrics: metrics(0.7),
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:00.000Z",
      completedAt: "2026-03-20T00:00:00.000Z",
    },
    {
      jobId: "old1",
      uid: "user-123",
      projectId: "proj-1",
      url: "https://a.com",
      status: "completed",
      strategy: "mobile",
      retryCount: 0,
      metrics: metrics(0.75),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      jobId: "old2",
      uid: "user-123",
      projectId: "proj-1",
      url: "https://b.com",
      status: "completed",
      strategy: "mobile",
      retryCount: 0,
      metrics: metrics(0.7),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      jobId: "old3",
      uid: "user-123",
      projectId: "proj-1",
      url: "https://c.com",
      status: "completed",
      strategy: "mobile",
      retryCount: 0,
      metrics: metrics(0.7),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
});

describe("PERF-166 integration", () => {
  it("T-PERF-166-019: GET /projects/:id/health exercises route→service→adapter and returns computed payload", async () => {
    const res = await request(app)
      .get("/api/v1/projects/proj-1/health")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      overallScore: 80,
      scoreDelta: 8.3,
      deltaLabel: "+8.3% since last week",
      inProgressCount: 0,
      attentionCount: 0,
    });
    expect(res.body.urlScores).toHaveLength(3);
    expect(mockSetProjectHealthCache).toHaveBeenCalledOnce();
  });
});
