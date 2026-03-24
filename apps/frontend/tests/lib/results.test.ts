import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRecommendations,
  getSummary,
  sortBySeverity,
  sortByPriority,
  getSeverityBadgeVariant,
  formatEvidence,
  isDevTicket,
  normalizeTicket,
  parseSourceRefs,
  buildMetricLookup,
  COPY_RESULTS_LOAD_FAILED,
  COPY_AI_UNAVAILABLE,
  COPY_AUDIT_NOT_FOUND,
  COPY_AUDIT_NOT_COMPLETED,
  COPY_RESULTS_EMPTY,
  COPY_AUDIT_FORBIDDEN,
  type Severity,
  type DevTicket,
  type RuleEngineTicket,
  type MetricLookup,
  type Recommendation,
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

/* ------------------------------------------------------------------ */
/* formatEvidence                                                      */
/* ------------------------------------------------------------------ */

describe("formatEvidence", () => {
  it("formats evidence object as human-readable string", () => {
    expect(formatEvidence({ threshold: 2500, actual: 4200, delta: "+1700ms" })).toBe(
      "Actual: 4200, Threshold: 2500, Delta: +1700ms"
    );
  });

  it("handles score-type evidence", () => {
    expect(formatEvidence({ threshold: 0.1, actual: 0.25, delta: "+0.15" })).toBe(
      "Actual: 0.25, Threshold: 0.1, Delta: +0.15"
    );
  });
});

/* ------------------------------------------------------------------ */
/* isDevTicket                                                         */
/* ------------------------------------------------------------------ */

describe("isDevTicket", () => {
  it("returns true for AI-generated DevTicket (has title)", () => {
    const ticket: DevTicket = {
      title: "Fix LCP",
      description: "Optimize images.",
      priority: "P0",
      category: "loading",
      metric: "lcp",
      currentValue: "4.2s",
      targetValue: "2.5s",
      estimatedImpact: "high",
      suggestedFix: "Compress images.",
    };
    expect(isDevTicket(ticket)).toBe(true);
  });

  it("returns false for RuleEngineTicket (no title)", () => {
    const ticket: RuleEngineTicket = {
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      value: 4200,
      unit: "ms",
      rating: "poor",
      severity: "P0",
      category: "loading",
      suggestedFix: "Optimize images.",
      evidence: { threshold: 2500, actual: 4200, delta: "+1700ms" },
    };
    expect(isDevTicket(ticket)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* normalizeTicket                                                     */
/* ------------------------------------------------------------------ */

describe("normalizeTicket", () => {
  it("passes through DevTicket unchanged", () => {
    const ticket: DevTicket = {
      title: "Fix LCP",
      description: "Optimize images.",
      priority: "P0",
      category: "loading",
      metric: "lcp",
      currentValue: "4.2s",
      targetValue: "2.5s",
      estimatedImpact: "high",
      suggestedFix: "Compress images.",
    };
    expect(normalizeTicket(ticket)).toEqual(ticket);
  });

  it("normalizes RuleEngineTicket into NormalizedTicket shape", () => {
    const ticket: RuleEngineTicket = {
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      value: 4200,
      unit: "ms",
      rating: "poor",
      severity: "P0",
      category: "loading",
      suggestedFix: "Optimize images.",
      evidence: { threshold: 2500, actual: 4200, delta: "+1700ms" },
    };
    const normalized = normalizeTicket(ticket);
    expect(normalized.title).toBe("LCP — poor");
    expect(normalized.description).toBe("Optimize images.");
    expect(normalized.priority).toBe("P0");
    expect(normalized.category).toBe("loading");
    expect(normalized.metric).toBe("lcp");
    expect(normalized.currentValue).toBe("4200ms");
    expect(normalized.targetValue).toBe("threshold: 2500ms");
    expect(normalized.estimatedImpact).toBe("+1700ms");
    expect(normalized.suggestedFix).toBe("Optimize images.");
  });

  it("normalizes RuleEngineTicket with score unit (no unit suffix)", () => {
    const ticket: RuleEngineTicket = {
      ruleId: "CWV-CLS-001",
      metric: "cls",
      value: 0.25,
      unit: "score",
      rating: "poor",
      severity: "P0",
      category: "visual-stability",
      suggestedFix: "Set explicit dimensions.",
      evidence: { threshold: 0.1, actual: 0.25, delta: "+0.15" },
    };
    const normalized = normalizeTicket(ticket);
    expect(normalized.currentValue).toBe("0.25");
    expect(normalized.targetValue).toBe("threshold: 0.1");
  });
});

/* ================================================================== */
/* parseSourceRefs — PERF-148                                          */
/* ================================================================== */

describe("parseSourceRefs", () => {
  const lookup: Record<string, MetricLookup> = {
    LCP: {
      fullName: "Largest Contentful Paint",
      threshold: "2.5s",
      rating: "Poor",
      delta: "+0.7s",
    },
    CLS: { fullName: "Cumulative Layout Shift", threshold: "0.1", rating: "Good", delta: "-0.05" },
  };

  it("returns original text as single segment when no refs present", () => {
    const result = parseSourceRefs("No metrics here.", lookup);
    expect(result).toEqual(["No metrics here."]);
  });

  it("parses a single [METRIC: value] reference", () => {
    const result = parseSourceRefs("Your [LCP: 3.2s] is slow.", lookup);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Your ");
    expect(result[2]).toBe(" is slow.");

    const ref = result[1];
    expect(typeof ref).toBe("object");
    if (typeof ref === "object") {
      expect(ref.metric).toBe("LCP");
      expect(ref.value).toBe("3.2s");
      expect(ref.fullName).toBe("Largest Contentful Paint");
      expect(ref.threshold).toBe("2.5s");
      expect(ref.rating).toBe("Poor");
      expect(ref.delta).toBe("+0.7s");
    }
  });

  it("parses multiple references in one string", () => {
    const result = parseSourceRefs("[LCP: 3.2s] and [CLS: 0.05] are key.", lookup);
    expect(result).toHaveLength(4);
    expect(typeof result[0]).toBe("object"); // LCP ref
    expect(result[1]).toBe(" and ");
    expect(typeof result[2]).toBe("object"); // CLS ref
    expect(result[3]).toBe(" are key.");
  });

  it("handles unknown metric with fallback data", () => {
    const result = parseSourceRefs("Check [TBT: 150ms] now.", lookup);
    const ref = result[1];
    expect(typeof ref).toBe("object");
    if (typeof ref === "object") {
      expect(ref.metric).toBe("TBT");
      expect(ref.value).toBe("150ms");
      expect(ref.fullName).toBe("TBT");
      expect(ref.threshold).toBe("");
      expect(ref.rating).toBe("");
      expect(ref.delta).toBe("");
    }
  });

  it("handles ref at start of string", () => {
    const result = parseSourceRefs("[LCP: 3.2s] is slow.", lookup);
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe("object");
    expect(result[1]).toBe(" is slow.");
  });

  it("handles ref at end of string", () => {
    const result = parseSourceRefs("Check [LCP: 3.2s]", lookup);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Check ");
    expect(typeof result[1]).toBe("object");
  });

  it("handles empty string", () => {
    const result = parseSourceRefs("", lookup);
    expect(result).toEqual([""]);
  });

  it("handles ref with spaces in value", () => {
    const result = parseSourceRefs("[LCP: 3.2 s]", lookup);
    const ref = result[0];
    expect(typeof ref).toBe("object");
    if (typeof ref === "object") {
      expect(ref.value).toBe("3.2 s");
    }
  });

  it("is case-insensitive on metric key lookup", () => {
    const result = parseSourceRefs("[lcp: 3.2s]", lookup);
    const ref = result[0];
    expect(typeof ref).toBe("object");
    if (typeof ref === "object") {
      expect(ref.metric).toBe("LCP");
      expect(ref.fullName).toBe("Largest Contentful Paint");
    }
  });
});

/* ================================================================== */
/* buildMetricLookup — PERF-148                                        */
/* ================================================================== */

describe("buildMetricLookup", () => {
  const makeRec = (overrides: Partial<Recommendation> = {}): Recommendation => ({
    ruleId: "rule-1",
    metric: "LCP",
    severity: "P0",
    category: "performance",
    currentValue: "3.2s",
    targetValue: "2.5s",
    suggestedFix: "Optimize images.",
    evidence: { threshold: 2500, actual: 3200, delta: "+0.7s" },
    ...overrides,
  });

  it("builds lookup from recommendations", () => {
    const recs = [makeRec()];
    const lookup = buildMetricLookup(recs);
    expect(lookup["LCP"]).toEqual({
      fullName: "Largest Contentful Paint",
      threshold: "2.5s",
      rating: "Poor",
      delta: "+0.7s",
    });
  });

  it("uses first occurrence for duplicate metrics (highest severity)", () => {
    const recs = [
      makeRec({ severity: "P0", targetValue: "2.5s" }),
      makeRec({ severity: "P2", targetValue: "4.0s" }),
    ];
    const lookup = buildMetricLookup(recs);
    expect(lookup["LCP"]?.threshold).toBe("2.5s");
  });

  it("maps P0 to Poor rating", () => {
    const lookup = buildMetricLookup([makeRec({ severity: "P0" })]);
    expect(lookup["LCP"]?.rating).toBe("Poor");
  });

  it("maps P1 to Needs Improvement rating", () => {
    const lookup = buildMetricLookup([makeRec({ severity: "P1" })]);
    expect(lookup["LCP"]?.rating).toBe("Needs Improvement");
  });

  it("maps P2 to Good rating", () => {
    const lookup = buildMetricLookup([makeRec({ severity: "P2" })]);
    expect(lookup["LCP"]?.rating).toBe("Good");
  });

  it("maps P3 to Good rating", () => {
    const lookup = buildMetricLookup([makeRec({ severity: "P3" })]);
    expect(lookup["LCP"]?.rating).toBe("Good");
  });

  it("returns empty lookup for empty recommendations", () => {
    const lookup = buildMetricLookup([]);
    expect(Object.keys(lookup)).toHaveLength(0);
  });

  it("handles multiple different metrics", () => {
    const recs = [
      makeRec({ metric: "LCP", severity: "P0" }),
      makeRec({
        metric: "CLS",
        severity: "P1",
        ruleId: "rule-2",
        targetValue: "0.1",
        evidence: { threshold: 0.1, actual: 0.15, delta: "+0.05" },
      }),
    ];
    const lookup = buildMetricLookup(recs);
    expect(Object.keys(lookup)).toHaveLength(2);
    expect(lookup["LCP"]).toBeDefined();
    expect(lookup["CLS"]).toBeDefined();
  });
});
