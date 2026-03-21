import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRecommendations,
  getSummary,
  sortBySeverity,
  sortByPriority,
  getSeverityBadgeVariant,
  COPY_RESULTS_LOAD_FAILED,
  COPY_AI_UNAVAILABLE,
  COPY_AUDIT_NOT_FOUND,
  COPY_AUDIT_NOT_COMPLETED,
  COPY_RESULTS_EMPTY,
  COPY_AUDIT_FORBIDDEN,
  type Severity,
} from "../../lib/results";

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
/* getRecommendations                                                  */
/* ------------------------------------------------------------------ */

describe("getRecommendations", () => {
  it("sends GET /audits/:id/recommendations with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        auditId: "audit-123",
        recommendations: [
          {
            ruleId: "rule-1",
            metric: "LCP",
            severity: "P0",
            category: "Performance",
            currentValue: "4.2s",
            targetValue: "2.5s",
            suggestedFix: "Optimize images.",
            evidence: "Lighthouse data.",
          },
        ],
      }),
    });

    const result = await getRecommendations("audit-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/audits/audit-123/recommendations",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    );
    expect(result.auditId).toBe("audit-123");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.metric).toBe("LCP");
  });

  it("throws with status and code on 404 not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "AUDIT_NOT_FOUND",
        message: "Audit not found",
      }),
    });

    await expect(getRecommendations("nonexistent")).rejects.toMatchObject({
      message: "Audit not found",
      status: 404,
      code: "AUDIT_NOT_FOUND",
    });
  });

  it("throws with status and code on 400 audit not completed", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        code: "AUDIT_NOT_COMPLETED",
        message: "Audit still processing",
      }),
    });

    await expect(getRecommendations("audit-pending")).rejects.toMatchObject({
      message: "Audit still processing",
      status: 400,
      code: "AUDIT_NOT_COMPLETED",
    });
  });

  it("throws with status on 401 auth error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Authentication required",
      }),
    });

    await expect(getRecommendations("audit-123")).rejects.toMatchObject({
      message: "Authentication required",
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

    await expect(getRecommendations("audit-123")).rejects.toMatchObject({
      message: COPY_RESULTS_LOAD_FAILED,
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* getSummary                                                          */
/* ------------------------------------------------------------------ */

describe("getSummary", () => {
  it("sends GET /audits/:id/summary with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        auditId: "audit-123",
        executiveSummary: "Your site has issues.",
        tickets: [],
        aiAvailable: true,
        modelVersion: "gpt-4",
        promptHash: "abc123",
        generatedAt: "2026-03-20T00:00:00Z",
      }),
    });

    const result = await getSummary("audit-123");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/audits/audit-123/summary", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    expect(result.auditId).toBe("audit-123");
    expect(result.aiAvailable).toBe(true);
    expect(result.executiveSummary).toBe("Your site has issues.");
  });

  it("handles aiAvailable: false response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        auditId: "audit-123",
        executiveSummary: null,
        tickets: [{ title: "Rule engine ticket" }],
        aiAvailable: false,
        fallbackReason: "AI service timeout",
      }),
    });

    const result = await getSummary("audit-123");

    expect(result.aiAvailable).toBe(false);
    expect(result.executiveSummary).toBeNull();
    expect(result.fallbackReason).toBe("AI service timeout");
  });

  it("throws with status and code on 404 not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "AUDIT_NOT_FOUND",
        message: "Audit not found",
      }),
    });

    await expect(getSummary("nonexistent")).rejects.toMatchObject({
      message: "Audit not found",
      status: 404,
      code: "AUDIT_NOT_FOUND",
    });
  });

  it("throws with status on 401 auth error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Authentication required",
      }),
    });

    await expect(getSummary("audit-123")).rejects.toMatchObject({
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

    await expect(getSummary("audit-123")).rejects.toMatchObject({
      message: COPY_RESULTS_LOAD_FAILED,
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* sortBySeverity                                                      */
/* ------------------------------------------------------------------ */

describe("sortBySeverity", () => {
  it("sorts items by severity P0 → P3", () => {
    const items = [
      { severity: "P3" as Severity },
      { severity: "P0" as Severity },
      { severity: "P2" as Severity },
      { severity: "P1" as Severity },
    ];
    const sorted = sortBySeverity(items);
    expect(sorted.map((i) => i.severity)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortBySeverity([])).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const items = [{ severity: "P2" as Severity }, { severity: "P0" as Severity }];
    const sorted = sortBySeverity(items);
    expect(items[0]?.severity).toBe("P2"); // original unchanged
    expect(sorted[0]?.severity).toBe("P0"); // sorted copy
  });
});

/* ------------------------------------------------------------------ */
/* sortByPriority                                                      */
/* ------------------------------------------------------------------ */

describe("sortByPriority", () => {
  it("sorts items by priority P0 → P3", () => {
    const items = [
      { priority: "P2" as Severity },
      { priority: "P0" as Severity },
      { priority: "P3" as Severity },
      { priority: "P1" as Severity },
    ];
    const sorted = sortByPriority(items);
    expect(sorted.map((i) => i.priority)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortByPriority([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* getSeverityBadgeVariant                                             */
/* ------------------------------------------------------------------ */

describe("getSeverityBadgeVariant", () => {
  it("returns error for P0", () => {
    expect(getSeverityBadgeVariant("P0")).toBe("error");
  });

  it("returns warning for P1", () => {
    expect(getSeverityBadgeVariant("P1")).toBe("warning");
  });

  it("returns info for P2", () => {
    expect(getSeverityBadgeVariant("P2")).toBe("info");
  });

  it("returns neutral for P3", () => {
    expect(getSeverityBadgeVariant("P3")).toBe("neutral");
  });
});

/* ------------------------------------------------------------------ */
/* Copy constants                                                      */
/* ------------------------------------------------------------------ */

describe("Copy constants", () => {
  it("exports all required copy strings", () => {
    expect(COPY_RESULTS_LOAD_FAILED).toBe("Failed to load results. Please try again.");
    expect(COPY_AI_UNAVAILABLE).toBe("AI summary temporarily unavailable.");
    expect(COPY_AUDIT_NOT_FOUND).toBe("Audit not found.");
    expect(COPY_AUDIT_NOT_COMPLETED).toBe("Audit still processing. Please wait and try again.");
    expect(COPY_RESULTS_EMPTY).toBe("No issues found — your site is performing great!");
    expect(COPY_AUDIT_FORBIDDEN).toBe("You do not have access to this audit.");
  });
});
