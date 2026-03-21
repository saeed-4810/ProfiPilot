import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listProjects,
  createProject,
  getProject,
  addUrlToProject,
  deleteUrl,
  COPY_DASHBOARD_EMPTY,
  COPY_URL_VALIDATION_ERROR,
  COPY_PROJECT_NAME_REQUIRED,
  COPY_PROJECT_NAME_TOO_LONG,
  COPY_PROJECT_CREATED,
  COPY_URL_ADDED,
  COPY_URL_DELETED,
  COPY_PROJECT_LOAD_FAILED,
  COPY_PROJECT_CREATE_FAILED,
} from "../../lib/projects";

// --- Global fetch mock ---
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* listProjects                                                        */
/* ------------------------------------------------------------------ */

describe("listProjects", () => {
  it("sends GET /api/v1/projects with default pagination and credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        page: 1,
        size: 20,
        total: 1,
        items: [
          {
            projectId: "proj-1",
            ownerId: "user-1",
            name: "My Project",
            createdAt: "2026-03-20T00:00:00Z",
            updatedAt: "2026-03-20T00:00:00Z",
          },
        ],
      }),
    });

    const result = await listProjects();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/v1/projects?page=1&size=20", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("My Project");
  });

  it("sends custom pagination parameters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ page: 2, size: 10, total: 25, items: [] }),
    });

    await listProjects(2, 10);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/projects?page=2&size=10",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("throws with status and code on 401 auth error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Authentication required",
      }),
    });

    await expect(listProjects()).rejects.toMatchObject({
      message: "Authentication required",
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });

  it("throws with status and code on 500 server error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        status: 500,
        code: "PROJECT_LIST_FAILED",
        message: "Database error",
      }),
    });

    await expect(listProjects()).rejects.toMatchObject({
      message: "Database error",
      status: 500,
      code: "PROJECT_LIST_FAILED",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(listProjects()).rejects.toMatchObject({
      message: COPY_PROJECT_LOAD_FAILED,
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* createProject                                                       */
/* ------------------------------------------------------------------ */

describe("createProject", () => {
  it("sends POST /api/v1/projects with name and credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: "proj-new",
        name: "New Project",
        createdAt: "2026-03-20T00:00:00Z",
      }),
    });

    const result = await createProject("New Project");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: "New Project" }),
    });
    expect(result.projectId).toBe("proj-new");
    expect(result.name).toBe("New Project");
  });

  it("throws with status and code on 400 validation error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Name is required",
      }),
    });

    await expect(createProject("")).rejects.toMatchObject({
      message: "Name is required",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("throws with status and code on 401 auth error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Not authenticated",
      }),
    });

    await expect(createProject("Test")).rejects.toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(createProject("Test")).rejects.toMatchObject({
      message: COPY_PROJECT_CREATE_FAILED,
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* getProject                                                          */
/* ------------------------------------------------------------------ */

describe("getProject", () => {
  it("sends GET /api/v1/projects/:id with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          projectId: "proj-1",
          ownerId: "user-1",
          name: "My Project",
          createdAt: "2026-03-20T00:00:00Z",
          updatedAt: "2026-03-20T00:00:00Z",
        },
        urls: [
          {
            urlId: "url-1",
            projectId: "proj-1",
            url: "https://example.com",
            normalizedUrl: "https://example.com/",
            addedAt: "2026-03-20T00:00:00Z",
          },
        ],
      }),
    });

    const result = await getProject("proj-1");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/v1/projects/proj-1", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    expect(result.project.name).toBe("My Project");
    expect(result.urls).toHaveLength(1);
  });

  it("throws with status on 404 not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
      }),
    });

    await expect(getProject("nonexistent")).rejects.toMatchObject({
      message: "Project not found",
      status: 404,
      code: "PROJECT_NOT_FOUND",
    });
  });

  it("throws with status on 403 forbidden", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        status: 403,
        code: "PROJECT_FORBIDDEN",
        message: "Not authorized",
      }),
    });

    await expect(getProject("proj-other")).rejects.toMatchObject({
      status: 403,
      code: "PROJECT_FORBIDDEN",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(getProject("proj-1")).rejects.toMatchObject({
      message: "Failed to load project details.",
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* addUrlToProject                                                     */
/* ------------------------------------------------------------------ */

describe("addUrlToProject", () => {
  it("sends POST /api/v1/projects/:id/urls with URL and credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        urlId: "url-new",
        url: "https://example.com",
        normalizedUrl: "https://example.com/",
        addedAt: "2026-03-20T00:00:00Z",
      }),
    });

    const result = await addUrlToProject("proj-1", "https://example.com");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/v1/projects/proj-1/urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(result.urlId).toBe("url-new");
  });

  it("throws with status on 400 validation error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid URL",
      }),
    });

    await expect(addUrlToProject("proj-1", "bad")).rejects.toMatchObject({
      message: "Invalid URL",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("throws with status on 404 project not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
      }),
    });

    await expect(addUrlToProject("nonexistent", "https://example.com")).rejects.toMatchObject({
      status: 404,
      code: "PROJECT_NOT_FOUND",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(addUrlToProject("proj-1", "https://example.com")).rejects.toMatchObject({
      message: "Failed to add URL.",
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* deleteUrl                                                           */
/* ------------------------------------------------------------------ */

describe("deleteUrl", () => {
  it("sends DELETE /api/v1/projects/:id/urls/:urlId with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    });

    await deleteUrl("proj-1", "url-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/projects/proj-1/urls/url-1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    );
  });

  it("throws with status on 403 forbidden", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        status: 403,
        code: "PROJECT_FORBIDDEN",
        message: "Not authorized",
      }),
    });

    await expect(deleteUrl("proj-1", "url-1")).rejects.toMatchObject({
      status: 403,
      code: "PROJECT_FORBIDDEN",
    });
  });

  it("throws with status on 404 not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
      }),
    });

    await expect(deleteUrl("proj-1", "url-1")).rejects.toMatchObject({
      status: 404,
      code: "PROJECT_NOT_FOUND",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(deleteUrl("proj-1", "url-1")).rejects.toMatchObject({
      message: "Failed to delete URL.",
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Copy constants                                                      */
/* ------------------------------------------------------------------ */

describe("Copy constants", () => {
  it("exports all approved copy strings", () => {
    expect(COPY_DASHBOARD_EMPTY).toBe(
      "Create your first project to start auditing your web performance."
    );
    expect(COPY_URL_VALIDATION_ERROR).toBe("Please enter a valid URL including https://");
    expect(COPY_PROJECT_NAME_REQUIRED).toBe("Project name is required.");
    expect(COPY_PROJECT_NAME_TOO_LONG).toBe("Project name must be 100 characters or fewer.");
    expect(COPY_PROJECT_CREATED).toBe("Project created successfully.");
    expect(COPY_URL_ADDED).toBe("URL added to project.");
    expect(COPY_URL_DELETED).toBe("URL removed from project.");
    expect(COPY_PROJECT_LOAD_FAILED).toBe("Failed to load projects. Please try again.");
    expect(COPY_PROJECT_CREATE_FAILED).toBe("Failed to create project. Please try again.");
  });
});
