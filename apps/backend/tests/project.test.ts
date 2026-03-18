import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Audit worker mock (prevent real PSI calls from audit module) ---
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

// --- Firestore mock with subcollection support ---
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

// Subcollection mocks (for urls subcollection)
const mockSubSet = vi.fn();
const mockSubGet = vi.fn();
const mockSubDelete = vi.fn();

// Query mocks for projects collection
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockOffset = vi.fn();
const mockLimit = vi.fn();
const mockQueryGet = vi.fn();

// Subcollection query mocks
const mockSubOrderBy = vi.fn();
const mockSubQueryGet = vi.fn();

const mockFirestore = {
  collection: vi.fn((collectionName: string) => {
    if (collectionName === "projects") {
      return {
        doc: vi.fn(() => ({
          set: mockSet,
          get: mockGet,
          update: mockUpdate,
          delete: mockDelete,
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              set: mockSubSet,
              get: mockSubGet,
              delete: mockSubDelete,
            })),
            orderBy: mockSubOrderBy,
          })),
        })),
        where: mockWhere,
      };
    }
    // Fallback for other collections (audits, etc.)
    return {
      doc: vi.fn(() => ({
        set: vi.fn(),
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        update: vi.fn(),
      })),
    };
  }),
};

const { app } = await import("../src/index.js");

beforeEach(() => {
  vi.clearAllMocks();

  // Default: auth succeeds via session cookie
  mockVerifySessionCookie.mockResolvedValue({ uid: "user-123" });

  // Default: Firestore set succeeds
  mockSet.mockResolvedValue(undefined);
  mockSubSet.mockResolvedValue(undefined);
  mockSubDelete.mockResolvedValue(undefined);

  // Default: Firestore get returns a project owned by user-123
  mockGet.mockResolvedValue({
    exists: true,
    data: () => ({
      projectId: "proj-abc",
      ownerId: "user-123",
      name: "My Project",
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z",
    }),
  });

  // Default: subcollection query returns URLs
  mockSubOrderBy.mockReturnValue({ get: mockSubQueryGet });
  mockSubQueryGet.mockResolvedValue({
    docs: [
      {
        data: () => ({
          urlId: "url-001",
          projectId: "proj-abc",
          url: "https://example.com",
          normalizedUrl: "https://example.com",
          addedAt: "2026-03-18T00:00:00.000Z",
        }),
      },
    ],
  });

  // Default: where query chain for listing projects
  mockWhere.mockReturnValue({
    get: mockQueryGet,
    orderBy: mockOrderBy,
  });
  mockOrderBy.mockReturnValue({ offset: mockOffset });
  mockOffset.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ get: mockQueryGet });

  // Default: query returns one project
  mockQueryGet.mockResolvedValue({
    size: 1,
    docs: [
      {
        data: () => ({
          projectId: "proj-abc",
          ownerId: "user-123",
          name: "My Project",
          createdAt: "2026-03-18T00:00:00.000Z",
          updatedAt: "2026-03-18T00:00:00.000Z",
        }),
      },
    ],
  });
});

// ============================================================================
// P-PERF-116-001: Authenticated user creates a new project with valid name
// ============================================================================
describe("P-PERF-116-001: POST /api/v1/projects (create project)", () => {
  it("returns 201 with projectId, name, and createdAt", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "My New Project" });

    expect(res.status).toBe(201);
    expect(res.body.projectId).toBeDefined();
    expect(res.body.name).toBe("My New Project");
    expect(res.body.createdAt).toBeDefined();
    expect(mockSet).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// P-PERF-116-002: User adds a URL to an existing project
// ============================================================================
describe("P-PERF-116-002: POST /api/v1/projects/:id/urls (add URL)", () => {
  it("returns 201 with urlId, url, normalizedUrl, and addedAt", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com/page" });

    expect(res.status).toBe(201);
    expect(res.body.urlId).toBeDefined();
    expect(res.body.url).toBe("https://example.com/page");
    expect(res.body.normalizedUrl).toBeDefined();
    expect(res.body.addedAt).toBeDefined();
    expect(mockSubSet).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// P-PERF-116-003: User views project list on dashboard
// ============================================================================
describe("P-PERF-116-003: GET /api/v1/projects (list projects)", () => {
  it("returns 200 with paginated project list", async () => {
    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.size).toBe(20);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].projectId).toBe("proj-abc");
  });

  it("supports custom page and size query params", async () => {
    const res = await request(app)
      .get("/api/v1/projects?page=2&size=5")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.size).toBe(5);
  });

  it("clamps size to max 100 and page to min 1", async () => {
    const res = await request(app)
      .get("/api/v1/projects?page=0&size=999")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.size).toBe(100);
  });
});

// ============================================================================
// U-PERF-116-001: Loading skeleton while projects load (API contract)
// Backend verifies: API returns valid paginated response for frontend skeleton
// ============================================================================
describe("U-PERF-116-001: GET /api/v1/projects returns valid structure for loading skeleton", () => {
  it("returns page, size, total, and items array for frontend rendering", async () => {
    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("size");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

// ============================================================================
// U-PERF-116-002: Empty state with "Create your first project" CTA
// Backend verifies: API returns empty items array when user has no projects
// ============================================================================
describe("U-PERF-116-002: GET /api/v1/projects returns empty state", () => {
  it("returns empty items array when user has zero projects", async () => {
    mockQueryGet.mockResolvedValue({ size: 0, docs: [] });

    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

// ============================================================================
// U-PERF-116-003: Error state with retry CTA on API failure
// Backend verifies: API returns ErrorEnvelope on Firestore failure
// ============================================================================
describe("U-PERF-116-003: GET /api/v1/projects returns error envelope on failure", () => {
  it("returns 500 ErrorEnvelope when Firestore query fails", async () => {
    mockWhere.mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_LIST_FAILED",
      message: "Failed to retrieve projects.",
    });
    expect(res.body.traceId).toBeDefined();
  });
});

// ============================================================================
// T-PERF-116-001: POST /api/v1/projects creates Firestore document with correct schema
// ============================================================================
describe("T-PERF-116-001: POST /api/v1/projects creates correct Firestore document", () => {
  it("creates document with projectId, ownerId, name, createdAt, updatedAt", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "Test Project" });

    expect(res.status).toBe(201);
    expect(mockSet).toHaveBeenCalledOnce();
    const setArg = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg["projectId"]).toBeDefined();
    expect(setArg["ownerId"]).toBe("user-123");
    expect(setArg["name"]).toBe("Test Project");
    expect(setArg["createdAt"]).toBeDefined();
    expect(setArg["updatedAt"]).toBeDefined();
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
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

  it("returns 400 when name is empty string", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "x".repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 500 when Firestore set fails", async () => {
    mockSet.mockRejectedValue(new Error("Firestore write failed"));

    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "Test Project" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_CREATE_FAILED",
      message: "Failed to create project.",
    });
  });

  it("passes through AppError from service layer", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockSet.mockRejectedValue(new AppError(409, "PROJECT_CONFLICT", "Duplicate project."));

    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "Test Project" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PROJECT_CONFLICT");
  });
});

// ============================================================================
// T-PERF-116-002: GET /api/v1/projects returns paginated project list
// ============================================================================
describe("T-PERF-116-002: GET /api/v1/projects returns paginated list", () => {
  it("returns only projects where ownerId matches authenticated user", async () => {
    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(mockWhere).toHaveBeenCalledWith("ownerId", "==", "user-123");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].ownerId).toBe("user-123");
  });

  it("passes through AppError from adapter", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockWhere.mockImplementation(() => {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Firestore down.");
    });

    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("filters out corrupt Firestore documents via runtime validation", async () => {
    mockQueryGet.mockResolvedValue({
      size: 2,
      docs: [
        {
          data: () => ({
            projectId: "proj-valid",
            ownerId: "user-123",
            name: "Valid Project",
            createdAt: "2026-03-18T00:00:00.000Z",
            updatedAt: "2026-03-18T00:00:00.000Z",
          }),
        },
        {
          data: () => ({
            // Corrupt: missing required fields
            projectId: "proj-corrupt",
          }),
        },
      ],
    });

    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    // Total reflects Firestore count, but items only includes valid docs
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].projectId).toBe("proj-valid");
  });
});

// ============================================================================
// T-PERF-116-003: POST /api/v1/projects/:id/urls validates URL and stores
// ============================================================================
describe("T-PERF-116-003: POST /api/v1/projects/:id/urls (URL validation + storage)", () => {
  it("stores valid HTTPS URL with normalized form", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://EXAMPLE.COM/" });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe("https://EXAMPLE.COM/");
    expect(res.body.normalizedUrl).toBe("https://example.com");
    expect(mockSubSet).toHaveBeenCalledOnce();
  });

  it("returns 400 when URL is missing", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request body.",
    });
  });

  it("returns 400 when URL is not valid", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when URL is HTTP (not HTTPS)", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "http://example.com" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when project does not exist", async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await request(app)
      .post("/api/v1/projects/nonexistent/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  });

  it("returns 403 when user does not own the project", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        projectId: "proj-other",
        ownerId: "other-user-456",
        name: "Other Project",
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z",
      }),
    });

    const res = await request(app)
      .post("/api/v1/projects/proj-other/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      status: 403,
      code: "PROJECT_FORBIDDEN",
      message: "You do not have access to this project.",
    });
  });

  it("returns 500 when Firestore subcollection write fails", async () => {
    mockSubSet.mockRejectedValue(new Error("Firestore write failed"));

    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_URL_ADD_FAILED",
      message: "Failed to add URL to project.",
    });
  });

  it("passes through AppError from service layer on add URL", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGet.mockRejectedValue(new AppError(503, "SERVICE_UNAVAILABLE", "Firestore down."));

    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });
});

// ============================================================================
// T-PERF-116-004: Auth middleware rejects unauthenticated requests with 401
// ============================================================================
describe("T-PERF-116-004: Auth middleware rejects unauthenticated requests", () => {
  it("returns 401 on GET /api/v1/projects without session cookie", async () => {
    const res = await request(app).get("/api/v1/projects");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("returns 401 on POST /api/v1/projects without session cookie", async () => {
    const res = await request(app).post("/api/v1/projects").send({ name: "Test" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("returns 401 on POST /api/v1/projects/:id/urls without session cookie", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("returns 401 on DELETE /api/v1/projects/:id/urls/:urlId without session cookie", async () => {
    const res = await request(app).delete("/api/v1/projects/proj-abc/urls/url-001");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("returns 401 on GET /api/v1/projects/:id without session cookie", async () => {
    const res = await request(app).get("/api/v1/projects/proj-abc");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_NO_SESSION");
  });

  it("returns 401 when session cookie is invalid", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("Invalid"));
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid"));

    const res = await request(app).get("/api/v1/projects").set("Cookie", "__session=bad-session");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
  });
});

// ============================================================================
// GET /api/v1/projects/:id — single project with URLs
// ============================================================================
describe("GET /api/v1/projects/:id (single project)", () => {
  it("returns 200 with project and URLs for the owner", async () => {
    const res = await request(app)
      .get("/api/v1/projects/proj-abc")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.project).toMatchObject({
      projectId: "proj-abc",
      ownerId: "user-123",
      name: "My Project",
    });
    expect(res.body.urls).toHaveLength(1);
    expect(res.body.urls[0].urlId).toBe("url-001");
  });

  it("returns 404 when project does not exist", async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await request(app)
      .get("/api/v1/projects/nonexistent")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 404,
      code: "PROJECT_NOT_FOUND",
    });
  });

  it("returns 403 when user does not own the project", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        projectId: "proj-other",
        ownerId: "other-user-456",
        name: "Other Project",
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z",
      }),
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-other")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROJECT_FORBIDDEN");
  });

  it("returns null for corrupt Firestore project document", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        // Corrupt: missing required fields
        projectId: "proj-corrupt",
      }),
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-corrupt")
      .set("Cookie", "__session=valid-session");

    // Runtime validation returns null → service throws 404
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 500 when Firestore get fails", async () => {
    mockGet.mockRejectedValue(new Error("Firestore read failed"));

    const res = await request(app)
      .get("/api/v1/projects/proj-abc")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_GET_FAILED",
    });
  });

  it("passes through AppError from service on get project", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGet.mockRejectedValue(new AppError(503, "SERVICE_UNAVAILABLE", "Firestore down."));

    const res = await request(app)
      .get("/api/v1/projects/proj-abc")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("filters out corrupt URL documents from subcollection", async () => {
    mockSubQueryGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            urlId: "url-valid",
            projectId: "proj-abc",
            url: "https://example.com",
            normalizedUrl: "https://example.com",
            addedAt: "2026-03-18T00:00:00.000Z",
          }),
        },
        {
          data: () => ({
            // Corrupt: missing required fields
            urlId: "url-corrupt",
          }),
        },
      ],
    });

    const res = await request(app)
      .get("/api/v1/projects/proj-abc")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(200);
    expect(res.body.urls).toHaveLength(1);
    expect(res.body.urls[0].urlId).toBe("url-valid");
  });
});

// ============================================================================
// DELETE /api/v1/projects/:id/urls/:urlId — remove URL
// ============================================================================
describe("DELETE /api/v1/projects/:id/urls/:urlId (remove URL)", () => {
  it("returns 204 on successful deletion", async () => {
    const res = await request(app)
      .delete("/api/v1/projects/proj-abc/urls/url-001")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(204);
    expect(mockSubDelete).toHaveBeenCalledOnce();
  });

  it("returns 404 when project does not exist", async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await request(app)
      .delete("/api/v1/projects/nonexistent/urls/url-001")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 403 when user does not own the project", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        projectId: "proj-other",
        ownerId: "other-user-456",
        name: "Other Project",
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z",
      }),
    });

    const res = await request(app)
      .delete("/api/v1/projects/proj-other/urls/url-001")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROJECT_FORBIDDEN");
  });

  it("returns 500 when Firestore delete fails", async () => {
    mockSubDelete.mockRejectedValue(new Error("Firestore delete failed"));

    const res = await request(app)
      .delete("/api/v1/projects/proj-abc/urls/url-001")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "PROJECT_URL_DELETE_FAILED",
    });
  });

  it("passes through AppError from service on delete URL", async () => {
    const { AppError } = await import("../src/domain/errors.js");
    mockGet.mockRejectedValue(new AppError(503, "SERVICE_UNAVAILABLE", "Firestore down."));

    const res = await request(app)
      .delete("/api/v1/projects/proj-abc/urls/url-001")
      .set("Cookie", "__session=valid-session");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });
});

// ============================================================================
// Domain: normalizeUrl utility
// ============================================================================
describe("Domain: normalizeUrl", () => {
  it("lowercases hostname", async () => {
    const { normalizeUrl } = await import("../src/domain/project.js");
    expect(normalizeUrl("https://EXAMPLE.COM/path")).toBe("https://example.com/path");
  });

  it("strips trailing slash from root path", async () => {
    const { normalizeUrl } = await import("../src/domain/project.js");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("preserves trailing slash on non-root paths", async () => {
    const { normalizeUrl } = await import("../src/domain/project.js");
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path/");
  });

  it("strips default HTTPS port 443", async () => {
    const { normalizeUrl } = await import("../src/domain/project.js");
    expect(normalizeUrl("https://example.com:443/path")).toBe("https://example.com/path");
  });

  it("strips default HTTP port 80", async () => {
    const { normalizeUrl } = await import("../src/domain/project.js");
    expect(normalizeUrl("http://example.com:80/path")).toBe("http://example.com/path");
  });

  it("preserves non-default ports", async () => {
    const { normalizeUrl } = await import("../src/domain/project.js");
    expect(normalizeUrl("https://example.com:8080/path")).toBe("https://example.com:8080/path");
  });
});

// ============================================================================
// E-PROJ-001 / E-PROJ-002: E2E scenario API contracts
// Backend verifies the API contracts that E2E tests will exercise
// ============================================================================
describe("E-PROJ-001: Project creation flow API contract", () => {
  it("POST /api/v1/projects returns projectId for redirect to project detail", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Cookie", "__session=valid-session")
      .send({ name: "E2E Test Project" });

    expect(res.status).toBe(201);
    expect(typeof res.body.projectId).toBe("string");
    expect(res.body.projectId.length).toBeGreaterThan(0);
  });
});

describe("E-PROJ-002: URL addition flow API contract", () => {
  it("POST /api/v1/projects/:id/urls validates and returns stored URL", async () => {
    const res = await request(app)
      .post("/api/v1/projects/proj-abc/urls")
      .set("Cookie", "__session=valid-session")
      .send({ url: "https://example.com/test" });

    expect(res.status).toBe(201);
    expect(res.body.urlId).toBeDefined();
    expect(res.body.url).toBe("https://example.com/test");
    expect(res.body.normalizedUrl).toBeDefined();
  });
});
