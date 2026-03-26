import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getProjectHealth,
  getProjectAudits,
  getProjectTrends,
  classifyScore,
  formatDelta,
  COPY_PROJECT_DETAIL_ERROR,
  COPY_PROJECT_NOT_FOUND,
  COPY_NO_AUDITS,
  COPY_NO_URLS,
  COPY_NO_CRUX,
  COPY_HEALTH_HEADING,
  COPY_TRENDS_HEADING,
  COPY_AUDIT_LOG_HEADING,
  COPY_ENDPOINT_HEADING,
  COPY_START_AUDIT,
  COPY_VIEW_REPORT,
  COPY_RUN_AUDIT,
  COPY_FIELD_LEGEND,
  COPY_LAB_LEGEND,
} from "../../lib/project-detail";

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
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

describe("classifyScore", () => {
  it("returns 'success' for score >= 90", () => {
    expect(classifyScore(90)).toBe("success");
    expect(classifyScore(100)).toBe("success");
  });

  it("returns 'warning' for score 50-89", () => {
    expect(classifyScore(50)).toBe("warning");
    expect(classifyScore(89)).toBe("warning");
  });

  it("returns 'error' for score < 50", () => {
    expect(classifyScore(0)).toBe("error");
    expect(classifyScore(49)).toBe("error");
  });

  it("returns 'neutral' for null", () => {
    expect(classifyScore(null)).toBe("neutral");
  });
});

describe("formatDelta", () => {
  it("returns up direction for positive delta", () => {
    const result = formatDelta(4.2);
    expect(result.text).toBe("+4.2%");
    expect(result.direction).toBe("up");
  });

  it("returns down direction for negative delta", () => {
    const result = formatDelta(-2.1);
    expect(result.text).toBe("-2.1%");
    expect(result.direction).toBe("down");
  });

  it("returns neutral for zero", () => {
    const result = formatDelta(0);
    expect(result.text).toBe("—");
    expect(result.direction).toBe("neutral");
  });

  it("returns neutral for null", () => {
    const result = formatDelta(null);
    expect(result.text).toBe("—");
    expect(result.direction).toBe("neutral");
  });
});

/* ------------------------------------------------------------------ */
/* Copy constants                                                      */
/* ------------------------------------------------------------------ */

describe("copy constants", () => {
  it("exports all required copy strings", () => {
    expect(COPY_PROJECT_DETAIL_ERROR).toBe("Failed to load project data. Please try again.");
    expect(COPY_PROJECT_NOT_FOUND).toBe("Project not found.");
    expect(COPY_NO_AUDITS).toBe("No audits yet. Run your first audit to see results here.");
    expect(COPY_NO_URLS).toBe("No URLs added yet. Add a URL to start tracking performance.");
    expect(COPY_NO_CRUX).toContain("real-user traffic");
    expect(COPY_HEALTH_HEADING).toBe("Overall Project Health");
    expect(COPY_TRENDS_HEADING).toBe("30-Day Performance Trends");
    expect(COPY_AUDIT_LOG_HEADING).toBe("Audit Log");
    expect(COPY_ENDPOINT_HEADING).toBe("Endpoint Registry");
    expect(COPY_START_AUDIT).toBe("Start New Project Audit");
    expect(COPY_VIEW_REPORT).toBe("View Report");
    expect(COPY_RUN_AUDIT).toBe("Run Audit");
    expect(COPY_FIELD_LEGEND).toBe("Field data (real users)");
    expect(COPY_LAB_LEGEND).toBe("Lab data (Lighthouse)");
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-001: getProjectHealth                                    */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-001: getProjectHealth", () => {
  it("sends GET /api/v1/projects/:id/health with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: "proj-1",
        overallScore: 72,
        scoreDelta: 4.2,
        deltaLabel: "+4.2% since last week",
        urlScores: [
          {
            urlId: "u1",
            url: "https://example.com",
            label: "Home",
            score: 72,
            lastAuditDate: "2026-03-25",
          },
        ],
        inProgressCount: 0,
        attentionCount: 0,
        computedAt: "2026-03-25T12:00:00Z",
      }),
    });

    const result = await getProjectHealth("proj-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/projects/proj-1/health",
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
    expect(result.overallScore).toBe(72);
    expect(result.urlScores).toHaveLength(1);
  });

  it("throws with status and code on 404", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 404, code: "PROJECT_NOT_FOUND", message: "Project not found." }),
    });

    try {
      await getProjectHealth("nonexistent");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.status).toBe(404);
      expect(typed.code).toBe("PROJECT_NOT_FOUND");
    }
  });

  it("throws with fallback message when server message is empty", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500, code: "PROJECT_HEALTH_FAILED" }),
    });

    try {
      await getProjectHealth("proj-1");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.message).toBe(COPY_PROJECT_DETAIL_ERROR);
    }
  });

  it("uses fallback code UNKNOWN when server error code is missing", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500, message: "Internal error" }),
    });

    try {
      await getProjectHealth("proj-1");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.code).toBe("UNKNOWN");
    }
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-003: getProjectAudits                                    */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-003: getProjectAudits", () => {
  it("sends GET /api/v1/projects/:id/audits with default pagination", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        page: 1,
        size: 20,
        total: 2,
        items: [
          {
            jobId: "a1",
            url: "https://example.com",
            performanceScore: 85,
            status: "completed",
            createdAt: "2026-03-25T10:00:00Z",
          },
          {
            jobId: "a2",
            url: "https://example.com/about",
            performanceScore: 45,
            status: "completed",
            createdAt: "2026-03-24T10:00:00Z",
          },
        ],
      }),
    });

    const result = await getProjectAudits("proj-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/projects/proj-1/audits?page=1&size=20",
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
    expect(result.items).toHaveLength(2);
  });

  it("sends custom pagination parameters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ page: 2, size: 5, total: 10, items: [] }),
    });

    await getProjectAudits("proj-1", 2, 5);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/projects/proj-1/audits?page=2&size=5",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("throws on server error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500, code: "PROJECT_AUDITS_FAILED" }),
    });

    try {
      await getProjectAudits("proj-1");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.status).toBe(500);
    }
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-002: getProjectTrends                                    */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-002: getProjectTrends", () => {
  it("sends GET /api/v1/projects/:id/trends with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: "proj-1",
        cruxAvailable: true,
        cruxPeriods: [
          {
            startDate: "2026-02-23",
            endDate: "2026-03-01",
            lcpP75: 2500,
            clsP75: 0.1,
            inpP75: 200,
          },
        ],
        labDataPoints: [
          { date: "2026-03-25T10:00:00Z", lcp: 2400, cls: 0.08, tbt: 150, performanceScore: 0.85 },
        ],
      }),
    });

    const result = await getProjectTrends("proj-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/projects/proj-1/trends",
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
    expect(result.cruxAvailable).toBe(true);
    expect(result.cruxPeriods).toHaveLength(1);
    expect(result.labDataPoints).toHaveLength(1);
  });

  it("returns cruxAvailable=false for low-traffic sites", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: "proj-2",
        cruxAvailable: false,
        cruxPeriods: [],
        labDataPoints: [],
      }),
    });

    const result = await getProjectTrends("proj-2");
    expect(result.cruxAvailable).toBe(false);
    expect(result.cruxPeriods).toHaveLength(0);
  });

  it("throws on 403 forbidden", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ status: 403, code: "PROJECT_FORBIDDEN", message: "Access denied." }),
    });

    try {
      await getProjectTrends("proj-1");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.status).toBe(403);
      expect(typed.code).toBe("PROJECT_FORBIDDEN");
    }
  });
});
