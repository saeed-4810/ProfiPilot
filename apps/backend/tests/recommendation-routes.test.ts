import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Audit worker mock (prevent real PSI calls) ---
vi.mock("../src/services/audit-worker.js", () => ({
  processAuditJob: vi.fn().mockResolvedValue(undefined),
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
      firestore: () => mockFirestore,
    })),
    credential: {
      cert: vi.fn(() => "mock-cert"),
      applicationDefault: vi.fn(() => "mock-adc"),
    },
  },
}));

// --- Service mocks ---
const mockGetAuditRecommendations = vi.fn();
const mockGetAuditSummary = vi.fn();
const mockRegenerateRecommendations = vi.fn();

vi.mock("../src/services/recommendation-service.js", () => ({
  getAuditRecommendations: (...args: unknown[]) => mockGetAuditRecommendations(...args),
  getAuditSummary: (...args: unknown[]) => mockGetAuditSummary(...args),
  regenerateRecommendations: (...args: unknown[]) => mockRegenerateRecommendations(...args),
}));

// --- Firestore mock (needed for audit.ts routes that share the app) ---
const mockFirestore = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      set: vi.fn(),
      get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      update: vi.fn(),
    })),
    where: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
      })),
    })),
  })),
};

const { app } = await import("../src/index.js");
const { AppError } = await import("../src/domain/errors.js");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: auth succeeds via session cookie
  mockVerifySessionCookie.mockResolvedValue({ uid: "user-123" });
});

// =============================================================================
// T-PERF-117-005: Request without auth → 401
// =============================================================================
describe("T-PERF-117-005: Auth required for all recommendation endpoints", () => {
  it("GET /audits/:id/recommendations returns 401 without session cookie", async () => {
    const res = await request(app).get("/audits/audit-123/recommendations");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("GET /audits/:id/summary returns 401 without session cookie", async () => {
    const res = await request(app).get("/audits/audit-123/summary");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });

  it("POST /audits/:id/recommendations/regenerate returns 401 without session cookie", async () => {
    const res = await request(app).post("/audits/audit-123/recommendations/regenerate");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });

  it("returns 401 with invalid session cookie", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("Invalid"));
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid"));

    const res = await request(app)
      .get("/audits/audit-123/recommendations")
      .set("Cookie", "__session=bad-session");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
  });
});

// =============================================================================
// Route handler delegation and HTTP status codes
// =============================================================================
describe("GET /audits/:id/recommendations — route handler", () => {
  it("returns 200 with CTR-007 response shape", async () => {
    mockGetAuditRecommendations.mockResolvedValue({
      auditId: "audit-123",
      recommendations: [
        {
          ruleId: "CWV-LCP-001",
          metric: "lcp",
          severity: "P2",
          category: "loading",
          currentValue: "3.5s",
          targetValue: "<2500ms",
          suggestedFix: "Optimize LCP.",
          evidence: { threshold: 2500, actual: 3500, delta: "+1000ms" },
        },
      ],
    });

    const res = await request(app)
      .get("/audits/audit-123/recommendations")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.auditId).toBe("audit-123");
    expect(res.body.recommendations).toHaveLength(1);
    expect(res.body.recommendations[0].ruleId).toBe("CWV-LCP-001");
    expect(mockGetAuditRecommendations).toHaveBeenCalledWith("user-123", "audit-123");
  });

  it("passes through AppError (404) from service", async () => {
    mockGetAuditRecommendations.mockRejectedValue(
      new AppError(404, "AUDIT_NOT_FOUND", "Audit job not found.")
    );

    const res = await request(app)
      .get("/audits/nonexistent/recommendations")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("AUDIT_NOT_FOUND");
  });

  it("passes through AppError (403) from service", async () => {
    mockGetAuditRecommendations.mockRejectedValue(
      new AppError(403, "AUDIT_FORBIDDEN", "You do not have access to this audit job.")
    );

    const res = await request(app)
      .get("/audits/audit-123/recommendations")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AUDIT_FORBIDDEN");
  });

  it("passes through AppError (400) from service", async () => {
    mockGetAuditRecommendations.mockRejectedValue(
      new AppError(
        400,
        "AUDIT_NOT_COMPLETED",
        "Audit is still processing, results not yet available."
      )
    );

    const res = await request(app)
      .get("/audits/audit-123/recommendations")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("AUDIT_NOT_COMPLETED");
  });

  it("returns 500 RECOMMENDATION_FETCH_FAILED for unexpected errors", async () => {
    mockGetAuditRecommendations.mockRejectedValue(new Error("Unexpected"));

    const res = await request(app)
      .get("/audits/audit-123/recommendations")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "RECOMMENDATION_FETCH_FAILED",
      message: "Failed to fetch recommendations.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

describe("GET /audits/:id/summary — route handler", () => {
  it("returns 200 with CTR-008 AI response shape", async () => {
    mockGetAuditSummary.mockResolvedValue({
      auditId: "audit-123",
      executiveSummary: "Your site needs improvement.",
      tickets: [
        {
          title: "Fix LCP",
          description: "LCP is too high.",
          priority: "P2",
          category: "loading",
          metric: "lcp",
          currentValue: "3.5s",
          targetValue: "<2.5s",
          estimatedImpact: "high",
          suggestedFix: "Optimize images.",
        },
      ],
      modelVersion: "gpt-4o-2024-08-06",
      promptHash: "abc123",
      generatedAt: "2026-03-17T00:06:00.000Z",
      aiAvailable: true,
    });

    const res = await request(app)
      .get("/audits/audit-123/summary")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.auditId).toBe("audit-123");
    expect(res.body.aiAvailable).toBe(true);
    expect(res.body.executiveSummary).toBe("Your site needs improvement.");
    expect(res.body.modelVersion).toBe("gpt-4o-2024-08-06");
    expect(res.body.promptHash).toBe("abc123");
    expect(res.body.generatedAt).toBe("2026-03-17T00:06:00.000Z");
    expect(mockGetAuditSummary).toHaveBeenCalledWith("user-123", "audit-123");
  });

  it("returns 200 with CTR-008 fallback response shape", async () => {
    mockGetAuditSummary.mockResolvedValue({
      auditId: "audit-123",
      executiveSummary: null,
      tickets: [{ ruleId: "CWV-LCP-001", metric: "lcp" }],
      aiAvailable: false,
      fallbackReason: "openai_unavailable",
    });

    const res = await request(app)
      .get("/audits/audit-123/summary")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.aiAvailable).toBe(false);
    expect(res.body.executiveSummary).toBeNull();
    expect(res.body.fallbackReason).toBe("openai_unavailable");
  });

  it("passes through AppError from service", async () => {
    mockGetAuditSummary.mockRejectedValue(
      new AppError(400, "AUDIT_NOT_COMPLETED", "Audit is still processing.")
    );

    const res = await request(app)
      .get("/audits/audit-123/summary")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("AUDIT_NOT_COMPLETED");
  });

  it("returns 500 SUMMARY_FETCH_FAILED for unexpected errors", async () => {
    mockGetAuditSummary.mockRejectedValue(new Error("Unexpected"));

    const res = await request(app)
      .get("/audits/audit-123/summary")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "SUMMARY_FETCH_FAILED",
      message: "Failed to fetch summary.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

describe("POST /audits/:id/recommendations/regenerate — route handler", () => {
  it("returns 202 with generationId and status 'queued'", async () => {
    mockRegenerateRecommendations.mockResolvedValue({
      generationId: "gen-uuid-123",
      status: "queued",
    });

    const res = await request(app)
      .post("/audits/audit-123/recommendations/regenerate")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(202);
    expect(res.body.generationId).toBe("gen-uuid-123");
    expect(res.body.status).toBe("queued");
    expect(mockRegenerateRecommendations).toHaveBeenCalledWith("user-123", "audit-123");
  });

  it("passes through AppError (409) from service", async () => {
    mockRegenerateRecommendations.mockRejectedValue(
      new AppError(409, "AUDIT_CONFLICT", "A regeneration is already in progress for this audit.")
    );

    const res = await request(app)
      .post("/audits/audit-123/recommendations/regenerate")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("AUDIT_CONFLICT");
  });

  it("returns 500 REGENERATE_FAILED for unexpected errors", async () => {
    mockRegenerateRecommendations.mockRejectedValue(new Error("Unexpected"));

    const res = await request(app)
      .post("/audits/audit-123/recommendations/regenerate")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "REGENERATE_FAILED",
      message: "Failed to queue regeneration.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});
