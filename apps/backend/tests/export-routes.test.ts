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

// --- Service mock ---
const mockGenerateExport = vi.fn();

vi.mock("../src/services/export-service.js", () => ({
  generateExport: (...args: unknown[]) => mockGenerateExport(...args),
  validateExportFormat: vi.fn(),
}));

// --- Firestore mock (needed for other routes that share the app) ---
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
// T-PERF-118-006: No auth → 401 AUTH_NO_SESSION
// =============================================================================
describe("T-PERF-118-006: Auth required for export endpoint", () => {
  it("GET /audits/:id/export returns 401 without session cookie", async () => {
    const res = await request(app).get("/audits/audit-123/export?format=md");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("returns 401 with invalid session cookie", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("Invalid"));
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid"));

    const res = await request(app)
      .get("/audits/audit-123/export?format=md")
      .set("Cookie", "__session=bad-session");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
  });
});

// =============================================================================
// T-PERF-118-001: GET ?format=md → 200 markdown (Content-Type text/markdown)
// =============================================================================
describe("T-PERF-118-001: GET /audits/:id/export?format=md — happy path", () => {
  it("returns 200 with Content-Type text/markdown", async () => {
    const markdownContent = "# Web Performance Audit Report\n\n**URL:** https://example.com";
    mockGenerateExport.mockResolvedValue(markdownContent);

    const res = await request(app)
      .get("/audits/audit-123/export?format=md")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toBe(markdownContent);
    expect(mockGenerateExport).toHaveBeenCalledWith("user-123", "audit-123", "md");
  });

  it("defaults to format=md when no format query param is provided", async () => {
    const markdownContent = "# Report";
    mockGenerateExport.mockResolvedValue(markdownContent);

    const res = await request(app)
      .get("/audits/audit-123/export")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(mockGenerateExport).toHaveBeenCalledWith("user-123", "audit-123", "md");
  });
});

// =============================================================================
// T-PERF-118-002: GET ?format=pdf → 422 EXPORT_FORMAT_INVALID
// =============================================================================
describe("T-PERF-118-002: GET /audits/:id/export?format=pdf — 422", () => {
  it("returns 422 EXPORT_FORMAT_INVALID for format=pdf", async () => {
    mockGenerateExport.mockRejectedValue(
      new AppError(
        422,
        "EXPORT_FORMAT_INVALID",
        'Export format "pdf" is not supported. Supported formats: md.'
      )
    );

    const res = await request(app)
      .get("/audits/audit-123/export?format=pdf")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("EXPORT_FORMAT_INVALID");
  });
});

// =============================================================================
// T-PERF-118-003: In-progress audit → 400 AUDIT_NOT_COMPLETED
// =============================================================================
describe("T-PERF-118-003: GET /audits/:id/export — in-progress audit", () => {
  it("returns 400 AUDIT_NOT_COMPLETED", async () => {
    mockGenerateExport.mockRejectedValue(
      new AppError(
        400,
        "AUDIT_NOT_COMPLETED",
        "Audit is still processing, results not yet available."
      )
    );

    const res = await request(app)
      .get("/audits/audit-123/export?format=md")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("AUDIT_NOT_COMPLETED");
  });
});

// =============================================================================
// T-PERF-118-004: Non-existent audit → 404 AUDIT_NOT_FOUND
// =============================================================================
describe("T-PERF-118-004: GET /audits/:id/export — non-existent audit", () => {
  it("returns 404 AUDIT_NOT_FOUND", async () => {
    mockGenerateExport.mockRejectedValue(
      new AppError(404, "AUDIT_NOT_FOUND", "Audit job not found.")
    );

    const res = await request(app)
      .get("/audits/nonexistent/export?format=md")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("AUDIT_NOT_FOUND");
  });
});

// =============================================================================
// T-PERF-118-005: Other user's audit → 403 AUDIT_FORBIDDEN
// =============================================================================
describe("T-PERF-118-005: GET /audits/:id/export — forbidden", () => {
  it("returns 403 AUDIT_FORBIDDEN", async () => {
    mockGenerateExport.mockRejectedValue(
      new AppError(403, "AUDIT_FORBIDDEN", "You do not have access to this audit job.")
    );

    const res = await request(app)
      .get("/audits/audit-123/export?format=md")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AUDIT_FORBIDDEN");
  });
});

// =============================================================================
// Unexpected errors → 500 EXPORT_FAILED
// =============================================================================
describe("GET /audits/:id/export — unexpected errors", () => {
  it("returns 500 EXPORT_FAILED for unexpected errors", async () => {
    mockGenerateExport.mockRejectedValue(new Error("Unexpected"));

    const res = await request(app)
      .get("/audits/audit-123/export?format=md")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "EXPORT_FAILED",
      message: "Failed to generate export.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});
