import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Audit worker mock (fire-and-forget — prevent real PSI calls) ---
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

// --- Firestore mock ---
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();

const mockFirestore = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      set: mockSet,
      get: mockGet,
      update: mockUpdate,
    })),
  })),
};

const { app } = await import("../src/index.js");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: auth succeeds via session cookie
  mockVerifySessionCookie.mockResolvedValue({ uid: "user-123" });
  // Default: Firestore set succeeds
  mockSet.mockResolvedValue(undefined);
  // Default: Firestore get returns a document
  mockGet.mockResolvedValue({
    exists: true,
    data: () => ({
      jobId: "job-abc",
      uid: "user-123",
      url: "https://example.com",
      status: "queued",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-17T00:00:00.000Z",
    }),
  });
});

// T-PERF-100-001: POST /audits with valid URL → 202 with jobId
describe("T-PERF-100-001: POST /audits (valid URL)", () => {
  it("returns 202 with jobId, status queued, and createdAt", async () => {
    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.status).toBe("queued");
    expect(res.body.createdAt).toBeDefined();
    expect(mockSet).toHaveBeenCalledOnce();
  });
});

// T-PERF-100-002: POST /audits with missing/invalid URL → 400 ErrorEnvelope
describe("T-PERF-100-002: POST /audits (invalid URL)", () => {
  it("returns 400 when URL is missing", async () => {
    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=valid-session")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request body.",
    });
    expect(res.body.traceId).toBeDefined();
    expect(res.body.details).toBeDefined();
  });

  it("returns 400 when URL is not a valid URL", async () => {
    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=valid-session")
      .send({ url: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 400 when URL is HTTP (not HTTPS)", async () => {
    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=valid-session")
      .send({ url: "http://example.com" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });
});

// T-PERF-100-003: POST /audits without auth → 401 ErrorEnvelope
describe("T-PERF-100-003: POST /audits (no auth)", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await request(app).post("/audits").send({ url: "https://example.com" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("returns 401 when session cookie is invalid", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("Invalid"));
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid"));

    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=bad-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
  });
});

// T-PERF-100-004: GET /audits/:id/status → 200 with job status
describe("T-PERF-100-004: GET /audits/:id/status (valid)", () => {
  it("returns 200 with job status for the owner", async () => {
    const res = await request(app)
      .get("/audits/job-abc/status")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: "job-abc",
      status: "queued",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-17T00:00:00.000Z",
    });
  });

  it("returns 200 with completedAt and lastError when present", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        jobId: "job-done",
        uid: "user-123",
        url: "https://example.com",
        status: "failed",
        retryCount: 3,
        lastError: "Lighthouse timeout",
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T01:00:00.000Z",
        completedAt: "2026-03-17T01:00:00.000Z",
      }),
    });

    const res = await request(app)
      .get("/audits/job-done/status")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.lastError).toBe("Lighthouse timeout");
    expect(res.body.completedAt).toBe("2026-03-17T01:00:00.000Z");
  });

  it("returns 404 when audit job does not exist", async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await request(app)
      .get("/audits/nonexistent/status")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      code: "AUDIT_NOT_FOUND",
      message: "Audit job not found.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

// T-PERF-100-005: GET /audits/:id/status for another user's job → 403
describe("T-PERF-100-005: GET /audits/:id/status (forbidden)", () => {
  it("returns 403 when requesting another user's audit job", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        jobId: "job-other",
        uid: "other-user-456",
        url: "https://example.com",
        status: "queued",
        retryCount: 0,
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z",
      }),
    });

    const res = await request(app)
      .get("/audits/job-other/status")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      status: 403,
      code: "AUDIT_FORBIDDEN",
      message: "You do not have access to this audit job.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

// Adapter unit tests: updateAuditStatus coverage
describe("Adapter: updateAuditStatus", () => {
  it("updates status and updatedAt for non-terminal status", async () => {
    mockUpdate.mockResolvedValue(undefined);
    const { updateAuditStatus } = await import("../src/adapters/firestore-audit.js");

    await updateAuditStatus("job-abc", "running");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, string | number>;
    expect(updateArg["status"]).toBe("running");
    expect(updateArg["updatedAt"]).toBeDefined();
    expect(updateArg["completedAt"]).toBeUndefined();
  });

  it("sets completedAt when status is completed", async () => {
    mockUpdate.mockResolvedValue(undefined);
    const { updateAuditStatus } = await import("../src/adapters/firestore-audit.js");

    await updateAuditStatus("job-abc", "completed");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, string | number>;
    expect(updateArg["status"]).toBe("completed");
    expect(updateArg["completedAt"]).toBeDefined();
  });

  it("sets completedAt when status is failed", async () => {
    mockUpdate.mockResolvedValue(undefined);
    const { updateAuditStatus } = await import("../src/adapters/firestore-audit.js");

    await updateAuditStatus("job-abc", "failed", { lastError: "Timeout" });

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, string | number>;
    expect(updateArg["status"]).toBe("failed");
    expect(updateArg["completedAt"]).toBeDefined();
    expect(updateArg["lastError"]).toBe("Timeout");
  });

  it("sets retryCount and nextRetryAt when provided", async () => {
    mockUpdate.mockResolvedValue(undefined);
    const { updateAuditStatus } = await import("../src/adapters/firestore-audit.js");

    await updateAuditStatus("job-abc", "retrying", {
      retryCount: 2,
      nextRetryAt: "2026-03-17T02:00:00.000Z",
    });

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, string | number>;
    expect(updateArg["status"]).toBe("retrying");
    expect(updateArg["retryCount"]).toBe(2);
    expect(updateArg["nextRetryAt"]).toBe("2026-03-17T02:00:00.000Z");
    expect(updateArg["completedAt"]).toBeUndefined();
  });
});

// Adapter unit tests: createAuditJob with strategy
describe("Adapter: createAuditJob strategy", () => {
  it("includes strategy field in the created job document", async () => {
    mockSet.mockResolvedValue(undefined);
    const { createAuditJob } = await import("../src/adapters/firestore-audit.js");

    const job = await createAuditJob("user-123", "https://example.com", "desktop");

    expect(job.strategy).toBe("desktop");
    expect(mockSet).toHaveBeenCalledOnce();
    const setArg = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg["strategy"]).toBe("desktop");
  });

  it("defaults strategy to mobile when not specified", async () => {
    mockSet.mockResolvedValue(undefined);
    const { createAuditJob } = await import("../src/adapters/firestore-audit.js");

    const job = await createAuditJob("user-123", "https://example.com");

    expect(job.strategy).toBe("mobile");
  });
});

// Adapter unit tests: getAuditJob strategy default
describe("Adapter: getAuditJob strategy default", () => {
  it("defaults strategy to mobile for pre-ADR-012 documents", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        jobId: "job-old",
        uid: "user-123",
        url: "https://example.com",
        status: "queued",
        retryCount: 0,
        createdAt: "2026-03-17T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z",
        // No strategy field — pre-ADR-012 document
      }),
    });

    const { getAuditJob } = await import("../src/adapters/firestore-audit.js");
    const job = await getAuditJob("job-old");

    expect(job?.strategy).toBe("mobile");
  });
});

// Adapter unit tests: updateAuditMetrics coverage
describe("Adapter: updateAuditMetrics", () => {
  it("writes metrics and updatedAt to Firestore", async () => {
    mockUpdate.mockResolvedValue(undefined);
    const { updateAuditMetrics } = await import("../src/adapters/firestore-audit.js");

    const metrics = {
      lcp: 2500,
      cls: 0.05,
      tbt: 150,
      fcp: 1200,
      ttfb: 400,
      si: 3000,
      performanceScore: 0.85,
      lighthouseVersion: "12.0.0",
      fieldData: null,
      fetchedAt: "2026-03-18T12:00:00.000Z",
    };

    await updateAuditMetrics("job-abc", metrics);

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg["metrics"]).toEqual(metrics);
    expect(updateArg["updatedAt"]).toBeDefined();
  });
});

// Adapter unit tests: getAuditJob runtime validation (W5)
describe("Adapter: getAuditJob runtime validation", () => {
  it("returns null when Firestore document has corrupt data", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        jobId: "job-corrupt",
        // missing uid, url, status — will fail Zod validation
        retryCount: "not-a-number",
      }),
    });

    const { getAuditJob } = await import("../src/adapters/firestore-audit.js");
    const result = await getAuditJob("job-corrupt");

    expect(result).toBeNull();
  });
});

// Additional coverage: Firestore error paths
describe("Audit error paths (coverage)", () => {
  it("POST /audits returns 500 when Firestore set fails", async () => {
    mockSet.mockRejectedValue(new Error("Firestore write failed"));

    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "AUDIT_CREATE_FAILED",
      message: "Failed to create audit job.",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("POST /audits passes through AppError from adapter", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockSet.mockRejectedValue(new AppError(409, "AUDIT_CONFLICT", "Duplicate audit."));

    const res = await request(app)
      .post("/audits")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("AUDIT_CONFLICT");
  });

  it("GET /audits/:id/status returns 500 when Firestore get fails", async () => {
    mockGet.mockRejectedValue(new Error("Firestore read failed"));

    const res = await request(app)
      .get("/audits/job-abc/status")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "AUDIT_STATUS_FAILED",
      message: "Failed to retrieve audit status.",
    });
  });

  it("GET /audits/:id/status passes through AppError from adapter", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGet.mockRejectedValue(new AppError(503, "SERVICE_UNAVAILABLE", "Firestore down."));

    const res = await request(app)
      .get("/audits/job-abc/status")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });
});
