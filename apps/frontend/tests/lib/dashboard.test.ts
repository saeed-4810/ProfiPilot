import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDashboardStats } from "../../lib/dashboard";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-PERF-165-001: getDashboardStats", () => {
  it("sends GET /dashboard/stats with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeProjects: 5,
        inProgressAudits: 2,
        avgPerformanceScore: 87.5,
        attentionCount: 1,
      }),
    });

    const result = await getDashboardStats();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/dashboard/stats"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
    expect(result).toEqual({
      activeProjects: 5,
      inProgressAudits: 2,
      avgPerformanceScore: 87.5,
      attentionCount: 1,
    });
  });

  it("returns null avgPerformanceScore when no audits", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeProjects: 0,
        inProgressAudits: 0,
        avgPerformanceScore: null,
        attentionCount: 0,
      }),
    });

    const result = await getDashboardStats();
    expect(result.avgPerformanceScore).toBeNull();
  });

  it("throws error with status and code on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        status: 500,
        code: "DASHBOARD_STATS_FAILED",
        message: "Failed to retrieve dashboard stats.",
      }),
    });

    try {
      await getDashboardStats();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.message).toBe("Failed to retrieve dashboard stats.");
      expect(typed.status).toBe(500);
      expect(typed.code).toBe("DASHBOARD_STATS_FAILED");
    }
  });

  it("uses fallback message when server error message is empty", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500, code: "UNKNOWN" }),
    });

    try {
      await getDashboardStats();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.message).toBe("Failed to fetch dashboard stats.");
    }
  });

  it("uses fallback code when server error code is missing", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: 401, message: "Unauthorized" }),
    });

    try {
      await getDashboardStats();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const typed = err as Error & { status: number; code: string };
      expect(typed.status).toBe(401);
      expect(typed.code).toBe("UNKNOWN");
    }
  });
});
