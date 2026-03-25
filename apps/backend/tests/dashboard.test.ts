import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

vi.mock("../src/services/audit-worker.js", () => ({
  processAuditJob: vi.fn().mockResolvedValue(undefined),
}));

// Mock the dashboard service directly — cleaner than mocking Firestore for aggregate queries
const mockGetDashboardStats = vi.fn();
vi.mock("../src/services/dashboard-service.js", () => ({
  getDashboardStats: (...args: unknown[]) => mockGetDashboardStats(...args),
}));

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
          })),
          where: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ size: 0, docs: [] }),
            orderBy: vi.fn(() => ({
              offset: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn().mockResolvedValue({ docs: [] }),
                })),
              })),
              get: vi.fn().mockResolvedValue({ docs: [] }),
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

  // Default: dashboard stats returns populated data
  mockGetDashboardStats.mockResolvedValue({
    activeProjects: 2,
    inProgressAudits: 1,
    avgPerformanceScore: 80,
    attentionCount: 1,
  });
});

describe("PERF-164: GET /dashboard/stats", () => {
  it("returns 200 with aggregate stats for the authenticated user", async () => {
    const res = await request(app).get("/dashboard/stats").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeProjects: 2,
      inProgressAudits: 1,
      avgPerformanceScore: 80,
      attentionCount: 1,
    });
    expect(mockGetDashboardStats).toHaveBeenCalledWith("user-123");
  });

  it("returns null avg score and zero attention when user has no projects", async () => {
    mockGetDashboardStats.mockResolvedValue({
      activeProjects: 0,
      inProgressAudits: 0,
      avgPerformanceScore: null,
      attentionCount: 0,
    });

    const res = await request(app).get("/dashboard/stats").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeProjects: 0,
      inProgressAudits: 0,
      avgPerformanceScore: null,
      attentionCount: 0,
    });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/dashboard/stats");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("returns 500 error envelope when service throws", async () => {
    mockGetDashboardStats.mockRejectedValue(new Error("Firestore unavailable"));

    const res = await request(app).get("/dashboard/stats").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "DASHBOARD_STATS_FAILED",
      message: "Failed to retrieve dashboard stats.",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("passes through AppError from service layer", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGetDashboardStats.mockRejectedValue(new AppError(503, "SERVICE_UNAVAILABLE", "DB down."));

    const res = await request(app).get("/dashboard/stats").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });
});
