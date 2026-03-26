import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Audit worker mock (prevent real PSI calls) ---
vi.mock("../src/services/audit-worker.js", () => ({
  processAuditJob: vi.fn().mockResolvedValue(undefined),
}));

// --- Mock the project-health-service directly (route-level mock pattern) ---
const mockGetProjectHealth = vi.fn();
const mockGetProjectAudits = vi.fn();
const mockGetProjectTrends = vi.fn();
vi.mock("../src/services/project-health-service.js", () => ({
  getProjectHealth: (...args: unknown[]) => mockGetProjectHealth(...args),
  getProjectAudits: (...args: unknown[]) => mockGetProjectAudits(...args),
  getProjectTrends: (...args: unknown[]) => mockGetProjectTrends(...args),
}));

// --- Firebase Admin mock ---
const mockVerifySessionCookie = vi.fn();
const mockVerifyIdToken = vi.fn();

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
      firestore: () => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            set: vi.fn(),
            get: vi.fn().mockResolvedValue({ exists: false }),
            update: vi.fn(),
            collection: vi.fn(() => ({
              doc: vi.fn(() => ({
                set: vi.fn(),
                get: vi.fn().mockResolvedValue({ exists: false }),
                delete: vi.fn(),
              })),
              orderBy: vi.fn(() => ({
                get: vi.fn().mockResolvedValue({ docs: [] }),
              })),
            })),
          })),
          where: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ size: 0, docs: [] }),
            orderBy: vi.fn(() => ({
              offset: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn().mockResolvedValue({ docs: [] }),
                })),
              })),
              limit: vi.fn(() => ({
                get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
              })),
              get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
            })),
          })),
        })),
      }),
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

  // Default: health returns populated data
  mockGetProjectHealth.mockResolvedValue({
    overallScore: 75.5,
    scoreDelta: null,
    deltaLabel: "unknown",
    urlScores: [{ url: "https://example.com", performanceScore: 75.5, status: "completed" }],
    inProgressCount: 0,
    attentionCount: 0,
  });

  // Default: audits returns paginated list
  mockGetProjectAudits.mockResolvedValue({
    items: [
      {
        jobId: "audit-001",
        url: "https://example.com",
        status: "completed",
        performanceScore: 85,
        createdAt: "2026-03-20T00:00:00.000Z",
      },
    ],
    page: 1,
    size: 10,
    total: 1,
  });

  // Default: trends returns CrUX + lab data
  mockGetProjectTrends.mockResolvedValue({
    cruxAvailable: true,
    cruxPeriods: [
      {
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        lcpP75: 2500,
        clsP75: 0.1,
        inpP75: 200,
        fcpP75: 1800,
        ttfbP75: 800,
      },
    ],
    labDataPoints: [
      {
        url: "https://example.com",
        performanceScore: 80,
        createdAt: "2026-03-15T00:00:00.000Z",
      },
    ],
  });
});

// ============================================================================
// GET /api/v1/projects/:id/health — Project health summary
// ============================================================================
describe("PERF-166: GET /api/v1/projects/:id/health", () => {
  it("T-PERF-166-001: returns 200 with correct health data", async () => {
    const res = await request(app)
      .get("/api/v1/projects/proj-abc/health")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      overallScore: 75.5,
      scoreDelta: null,
      deltaLabel: "unknown",
      urlScores: [{ url: "https://example.com", performanceScore: 75.5, status: "completed" }],
      inProgressCount: 0,
      attentionCount: 0,
    });
    expect(mockGetProjectHealth).toHaveBeenCalledWith("user-123", "proj-abc");
  });

  it("T-PERF-166-002: returns 200 with null score when no audits exist", async () => {
    mockGetProjectHealth.mockResolvedValue({
      overallScore: null,
      scoreDelta: null,
      deltaLabel: "unknown",
      urlScores: [],
      inProgressCount: 0,
      attentionCount: 0,
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/health")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.overallScore).toBeNull();
    expect(res.body.urlScores).toEqual([]);
  });

  it("T-PERF-166-003: returns 404 for missing project", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGetProjectHealth.mockRejectedValue(
      new AppError(404, "PROJECT_NOT_FOUND", "Project not found.")
    );

    const res = await request(app)
      .get("/api/v1/projects/nonexistent/health")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("T-PERF-166-004: returns 403 for non-owner", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGetProjectHealth.mockRejectedValue(
      new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.")
    );

    const res = await request(app)
      .get("/api/v1/projects/proj-other/health")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROJECT_FORBIDDEN");
  });

  it("T-PERF-166-005: returns 401 without auth", async () => {
    const res = await request(app).get("/api/v1/projects/proj-abc/health");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("T-PERF-166-006: returns 500 on service error", async () => {
    mockGetProjectHealth.mockRejectedValue(new Error("Firestore unavailable"));

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/health")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_HEALTH_FAILED",
      message: "Failed to retrieve project health.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

// ============================================================================
// GET /api/v1/projects/:id/audits — Paginated audit history
// ============================================================================
describe("PERF-166: GET /api/v1/projects/:id/audits", () => {
  it("T-PERF-166-007: returns 200 with paginated audit list", async () => {
    const res = await request(app)
      .get("/api/v1/projects/proj-abc/audits")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      jobId: "audit-001",
      url: "https://example.com",
      status: "completed",
      performanceScore: 85,
    });
    expect(res.body.page).toBe(1);
    expect(res.body.size).toBe(10);
    expect(res.body.total).toBe(1);
    expect(mockGetProjectAudits).toHaveBeenCalledWith("user-123", "proj-abc", 1, 10);
  });

  it("T-PERF-166-008: returns 200 with empty list when no audits", async () => {
    mockGetProjectAudits.mockResolvedValue({
      items: [],
      page: 1,
      size: 10,
      total: 0,
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/audits")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("T-PERF-166-009: respects page and size query params", async () => {
    mockGetProjectAudits.mockResolvedValue({
      items: [],
      page: 2,
      size: 5,
      total: 10,
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/audits?page=2&size=5")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.size).toBe(5);
    expect(mockGetProjectAudits).toHaveBeenCalledWith("user-123", "proj-abc", 2, 5);
  });

  it("T-PERF-166-010: clamps page to min 1 and size to max 100", async () => {
    mockGetProjectAudits.mockResolvedValue({
      items: [],
      page: 1,
      size: 100,
      total: 0,
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/audits?page=0&size=999")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(mockGetProjectAudits).toHaveBeenCalledWith("user-123", "proj-abc", 1, 100);
  });

  it("T-PERF-166-011: returns 401 without auth", async () => {
    const res = await request(app).get("/api/v1/projects/proj-abc/audits");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("T-PERF-166-012: passes through AppError from service", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGetProjectAudits.mockRejectedValue(
      new AppError(404, "PROJECT_NOT_FOUND", "Project not found.")
    );

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/audits")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("T-PERF-166-013: returns 500 on non-AppError service failure", async () => {
    mockGetProjectAudits.mockRejectedValue(new Error("Firestore unavailable"));

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/audits")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_AUDITS_FAILED",
      message: "Failed to retrieve project audits.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

// ============================================================================
// GET /api/v1/projects/:id/trends — CrUX + lab data trends
// ============================================================================
describe("PERF-166: GET /api/v1/projects/:id/trends", () => {
  it("T-PERF-166-014: returns 200 with CrUX and lab data", async () => {
    const res = await request(app)
      .get("/api/v1/projects/proj-abc/trends")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.cruxAvailable).toBe(true);
    expect(res.body.cruxPeriods).toHaveLength(1);
    expect(res.body.cruxPeriods[0]).toMatchObject({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      lcpP75: 2500,
    });
    expect(res.body.labDataPoints).toHaveLength(1);
    expect(res.body.labDataPoints[0]).toMatchObject({
      url: "https://example.com",
      performanceScore: 80,
    });
    expect(mockGetProjectTrends).toHaveBeenCalledWith("user-123", "proj-abc");
  });

  it("T-PERF-166-015: returns cruxAvailable=false when no CrUX data", async () => {
    mockGetProjectTrends.mockResolvedValue({
      cruxAvailable: false,
      cruxPeriods: [],
      labDataPoints: [
        {
          url: "https://example.com",
          performanceScore: 70,
          createdAt: "2026-03-10T00:00:00.000Z",
        },
      ],
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/trends")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.cruxAvailable).toBe(false);
    expect(res.body.cruxPeriods).toEqual([]);
    expect(res.body.labDataPoints).toHaveLength(1);
  });

  it("T-PERF-166-016: returns 500 on service error", async () => {
    mockGetProjectTrends.mockRejectedValue(new Error("CrUX API failed"));

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/trends")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_TRENDS_FAILED",
      message: "Failed to retrieve project trends.",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("T-PERF-166-017: returns 401 without auth", async () => {
    const res = await request(app).get("/api/v1/projects/proj-abc/trends");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("T-PERF-166-018: passes through AppError from service", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGetProjectTrends.mockRejectedValue(
      new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.")
    );

    const res = await request(app)
      .get("/api/v1/projects/proj-abc/trends")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROJECT_FORBIDDEN");
  });
});
