import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditJob, AuditMetrics } from "../src/domain/audit.js";
import type {
  RuleEngineOutput,
  RecommendationDocument,
  AISummaryResult,
  AITicket,
} from "../src/domain/recommendation.js";

// --- Mock modules ---
const mockGetAuditJob = vi.fn();
const mockGetRecommendations = vi.fn();
const mockSaveRecommendations = vi.fn();
const mockGetSummary = vi.fn();
const mockSaveSummary = vi.fn();
const mockGenerateRecommendations = vi.fn();
const mockGenerateAISummary = vi.fn();

vi.mock("../src/adapters/firestore-audit.js", () => ({
  getAuditJob: (...args: unknown[]) => mockGetAuditJob(...args),
}));

vi.mock("../src/adapters/firestore-recommendation.js", () => ({
  getRecommendations: (...args: unknown[]) => mockGetRecommendations(...args),
  saveRecommendations: (...args: unknown[]) => mockSaveRecommendations(...args),
}));

vi.mock("../src/adapters/firestore-summary.js", () => ({
  getSummary: (...args: unknown[]) => mockGetSummary(...args),
  saveSummary: (...args: unknown[]) => mockSaveSummary(...args),
}));

vi.mock("../src/services/rule-engine.js", () => ({
  generateRecommendations: (...args: unknown[]) => mockGenerateRecommendations(...args),
  formatMetricValue: vi.fn(),
  getTargetValue: vi.fn(),
}));

vi.mock("../src/services/ai-narrative.js", () => ({
  generateAISummary: (...args: unknown[]) => mockGenerateAISummary(...args),
}));

const {
  getAuditRecommendations,
  getAuditSummary,
  regenerateRecommendations,
  _getActiveRegenerations,
} = await import("../src/services/recommendation-service.js");

// --- Test fixtures ---
function makeMetrics(): AuditMetrics {
  return {
    lcp: 3500,
    cls: 0.15,
    tbt: 450,
    fcp: 2200,
    ttfb: 900,
    si: 4000,
    performanceScore: 0.65,
    lighthouseVersion: "12.0.0",
    fieldData: null,
    fetchedAt: "2026-03-18T12:00:00.000Z",
  };
}

function makeCompletedJob(overrides?: Partial<AuditJob>): AuditJob {
  return {
    jobId: "audit-123",
    uid: "user-123",
    url: "https://example.com",
    status: "completed",
    strategy: "mobile",
    retryCount: 0,
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:05:00.000Z",
    completedAt: "2026-03-17T00:05:00.000Z",
    metrics: makeMetrics(),
    ...overrides,
  };
}

function makeRuleEngineOutput(): RuleEngineOutput[] {
  return [
    {
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      value: 3500,
      unit: "ms",
      rating: "needs-improvement",
      severity: "P2",
      category: "loading",
      suggestedFix: "Optimize LCP element.",
      evidence: { threshold: 2500, actual: 3500, delta: "+1000ms" },
    },
  ];
}

function makeRecommendationDocs(): RecommendationDocument[] {
  return [
    {
      auditId: "audit-123",
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      currentValue: "3.5s",
      targetValue: "<2500ms",
      severity: "P2",
      category: "loading",
      suggestedFix: "Optimize LCP element.",
      evidence: { threshold: 2500, actual: 3500, delta: "+1000ms" },
      createdAt: "2026-03-17T00:05:00.000Z",
    },
  ];
}

function makeAITickets(): AITicket[] {
  return [
    {
      title: "Optimize Largest Contentful Paint (LCP)",
      description:
        "LCP is 3.5 seconds, exceeding the 2.5-second threshold. This impacts user experience and SEO.",
      priority: "P2",
      category: "loading",
      metric: "lcp",
      currentValue: "3.5s",
      targetValue: "<2.5s",
      estimatedImpact: "high",
      suggestedFix:
        "Compress and serve images in modern formats (WebP/AVIF), preload the LCP resource, reduce server response time.",
    },
  ];
}

function makeAISummaryResultAI(): AISummaryResult {
  return {
    auditId: "audit-123",
    executiveSummary:
      "Your website performance needs improvement. The LCP metric is above the recommended threshold.",
    tickets: makeAITickets(),
    aiAvailable: true,
    metadata: {
      modelVersion: "gpt-4o-2024-08-06",
      promptHash: "abc123",
      promptVersion: "v1",
      temperature: 0.2,
      inputHash: "def456",
      generatedAt: "2026-03-17T00:06:00.000Z",
      latencyMs: 1500,
      inputTokens: 500,
      outputTokens: 300,
      costUsd: 0.005,
    },
  };
}

function makeAISummaryResultFallback(): AISummaryResult {
  return {
    auditId: "audit-123",
    executiveSummary: null,
    tickets: makeRuleEngineOutput(),
    aiAvailable: false,
    fallbackReason: "openai_unavailable",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _getActiveRegenerations().clear();
});

// =============================================================================
// getAuditRecommendations
// =============================================================================

// T-PERF-117-001: GET /audits/:id/recommendations returns rule engine output for completed audit
describe("T-PERF-117-001: getAuditRecommendations — happy path", () => {
  it("returns recommendations for a completed audit (already generated)", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetRecommendations.mockResolvedValue(makeRecommendationDocs());

    const result = await getAuditRecommendations("user-123", "audit-123");

    expect(result.auditId).toBe("audit-123");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toEqual({
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      severity: "P2",
      category: "loading",
      currentValue: "3.5s",
      targetValue: "<2500ms",
      suggestedFix: "Optimize LCP element.",
      evidence: { threshold: 2500, actual: 3500, delta: "+1000ms" },
    });
    // Should NOT include auditId or createdAt in recommendation items
    expect(result.recommendations[0]).not.toHaveProperty("auditId");
    expect(result.recommendations[0]).not.toHaveProperty("createdAt");
  });

  it("generates and saves recommendations on first access (lazy generation)", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    // First call: empty (not yet generated), second call: populated (after save)
    mockGetRecommendations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRecommendationDocs());
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockSaveRecommendations.mockResolvedValue(undefined);

    const result = await getAuditRecommendations("user-123", "audit-123");

    expect(mockGenerateRecommendations).toHaveBeenCalledWith(makeMetrics());
    expect(mockSaveRecommendations).toHaveBeenCalledWith("audit-123", makeRuleEngineOutput());
    expect(mockGetRecommendations).toHaveBeenCalledTimes(2);
    expect(result.recommendations).toHaveLength(1);
  });
});

// T-PERF-117-002: GET /audits/:id/recommendations for in-progress audit returns 400
describe("T-PERF-117-002: getAuditRecommendations — in-progress audit", () => {
  it("throws 400 AUDIT_NOT_COMPLETED for non-completed audit", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ status: "running" }));

    await expect(getAuditRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 400,
        code: "AUDIT_NOT_COMPLETED",
        message: "Audit is still processing, results not yet available.",
      },
    });
  });
});

// T-PERF-117-003: GET /audits/:id/recommendations for non-existent audit returns 404
describe("T-PERF-117-003: getAuditRecommendations — non-existent audit", () => {
  it("throws 404 AUDIT_NOT_FOUND when audit does not exist", async () => {
    mockGetAuditJob.mockResolvedValue(null);

    await expect(getAuditRecommendations("user-123", "nonexistent")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 404,
        code: "AUDIT_NOT_FOUND",
        message: "Audit job not found.",
      },
    });
  });
});

// T-PERF-117-004: GET /audits/:id/recommendations for another user's audit returns 403
describe("T-PERF-117-004: getAuditRecommendations — forbidden", () => {
  it("throws 403 AUDIT_FORBIDDEN when uid does not match", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ uid: "other-user" }));

    await expect(getAuditRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 403,
        code: "AUDIT_FORBIDDEN",
        message: "You do not have access to this audit job.",
      },
    });
  });
});

// T-PERF-117-012: Recommendations endpoint integrates with rule engine service
describe("T-PERF-117-012: Rule engine integration", () => {
  it("calls generateRecommendations with correct audit metrics", async () => {
    const metrics = makeMetrics();
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ metrics }));
    mockGetRecommendations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRecommendationDocs());
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockSaveRecommendations.mockResolvedValue(undefined);

    await getAuditRecommendations("user-123", "audit-123");

    expect(mockGenerateRecommendations).toHaveBeenCalledOnce();
    expect(mockGenerateRecommendations).toHaveBeenCalledWith(metrics);
  });
});

// P-PERF-117-001: Completed audit has viewable recommendations
describe("P-PERF-117-001: Recommendations include severity, category, suggestedFix, evidence", () => {
  it("returns recommendations with all required fields for developer consumption", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetRecommendations.mockResolvedValue(makeRecommendationDocs());

    const result = await getAuditRecommendations("user-123", "audit-123");

    const rec = result.recommendations[0]!;
    expect(rec.severity).toBe("P2");
    expect(rec.category).toBe("loading");
    expect(rec.suggestedFix).toBe("Optimize LCP element.");
    expect(rec.evidence).toEqual({ threshold: 2500, actual: 3500, delta: "+1000ms" });
    expect(rec.currentValue).toBe("3.5s");
    expect(rec.targetValue).toBe("<2500ms");
    expect(rec.ruleId).toBe("CWV-LCP-001");
    expect(rec.metric).toBe("lcp");
  });
});

// Edge case: completed audit with undefined metrics → 500 INTERNAL_ERROR
describe("Edge case: completed audit with undefined metrics", () => {
  it("throws 500 INTERNAL_ERROR when metrics are missing on completed audit", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ metrics: undefined }));

    await expect(getAuditRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Audit completed but metrics are missing.",
      },
    });
  });
});

// =============================================================================
// getAuditSummary
// =============================================================================

// T-PERF-117-006: GET /audits/:id/summary returns AI narrative when available
describe("T-PERF-117-006: getAuditSummary — AI available (cached)", () => {
  it("returns AI summary with flattened metadata from cache", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    const result = await getAuditSummary("user-123", "audit-123");

    expect(result.auditId).toBe("audit-123");
    expect(result.aiAvailable).toBe(true);
    if (result.aiAvailable) {
      expect(result.executiveSummary).toContain("performance needs improvement");
      expect(result.tickets).toHaveLength(1);
      expect(result.modelVersion).toBe("gpt-4o-2024-08-06");
      expect(result.promptHash).toBe("abc123");
      expect(result.generatedAt).toBe("2026-03-17T00:06:00.000Z");
      // Metadata should be flattened — NOT nested
      expect(result).not.toHaveProperty("metadata");
    }
  });

  it("generates and saves summary on first access (lazy generation)", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultAI());
    mockSaveSummary.mockResolvedValue(undefined);
    mockGetRecommendations.mockResolvedValue([]);
    mockSaveRecommendations.mockResolvedValue(undefined);

    const result = await getAuditSummary("user-123", "audit-123");

    expect(mockGenerateRecommendations).toHaveBeenCalledWith(makeMetrics());
    expect(mockGenerateAISummary).toHaveBeenCalledWith(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      makeRuleEngineOutput()
    );
    expect(mockSaveSummary).toHaveBeenCalledOnce();
    expect(mockSaveRecommendations).toHaveBeenCalledOnce();
    expect(result.aiAvailable).toBe(true);
  });

  it("skips saving recommendations when they already exist", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultAI());
    mockSaveSummary.mockResolvedValue(undefined);
    mockGetRecommendations.mockResolvedValue(makeRecommendationDocs());

    await getAuditSummary("user-123", "audit-123");

    expect(mockSaveRecommendations).not.toHaveBeenCalled();
  });
});

// T-PERF-117-007: GET /audits/:id/summary returns graceful degradation when AI unavailable
describe("T-PERF-117-007: getAuditSummary — AI unavailable (fallback)", () => {
  it("returns fallback with rule engine tickets and fallbackReason", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultFallback());
    mockSaveSummary.mockResolvedValue(undefined);
    mockGetRecommendations.mockResolvedValue([]);
    mockSaveRecommendations.mockResolvedValue(undefined);

    const result = await getAuditSummary("user-123", "audit-123");

    expect(result.aiAvailable).toBe(false);
    if (!result.aiAvailable) {
      expect(result.executiveSummary).toBeNull();
      expect(result.tickets).toEqual(makeRuleEngineOutput());
      expect(result.fallbackReason).toBe("openai_unavailable");
    }
  });
});

// T-PERF-117-008: GET /audits/:id/summary for in-progress audit returns 400
describe("T-PERF-117-008: getAuditSummary — in-progress audit", () => {
  it("throws 400 AUDIT_NOT_COMPLETED for non-completed audit", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ status: "queued" }));

    await expect(getAuditSummary("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 400,
        code: "AUDIT_NOT_COMPLETED",
      },
    });
  });
});

// T-PERF-117-009: GET /audits/:id/summary for non-existent audit returns 404
describe("T-PERF-117-009: getAuditSummary — non-existent audit", () => {
  it("throws 404 AUDIT_NOT_FOUND when audit does not exist", async () => {
    mockGetAuditJob.mockResolvedValue(null);

    await expect(getAuditSummary("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 404,
        code: "AUDIT_NOT_FOUND",
      },
    });
  });
});

// T-PERF-117-013: Summary endpoint integrates with AI narrative service
describe("T-PERF-117-013: AI narrative integration", () => {
  it("calls generateAISummary with correct arguments", async () => {
    const metrics = makeMetrics();
    const ruleOutput = makeRuleEngineOutput();
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ metrics }));
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(ruleOutput);
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultAI());
    mockSaveSummary.mockResolvedValue(undefined);
    mockGetRecommendations.mockResolvedValue(makeRecommendationDocs());

    await getAuditSummary("user-123", "audit-123");

    expect(mockGenerateAISummary).toHaveBeenCalledOnce();
    expect(mockGenerateAISummary).toHaveBeenCalledWith(
      "audit-123",
      "https://example.com",
      "mobile",
      metrics,
      ruleOutput
    );
  });
});

// P-PERF-117-002: AI summary provides business-friendly narrative
describe("P-PERF-117-002: AI summary provides business-friendly narrative", () => {
  it("returns executiveSummary and actionable tickets when AI is available", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    const result = await getAuditSummary("user-123", "audit-123");

    expect(result.aiAvailable).toBe(true);
    if (result.aiAvailable) {
      expect(typeof result.executiveSummary).toBe("string");
      expect(result.executiveSummary.length).toBeGreaterThan(0);
      const ticket = result.tickets[0]!;
      expect(ticket.title).toBeDefined();
      expect(ticket.description).toBeDefined();
      expect(ticket.suggestedFix).toBeDefined();
      expect(ticket.priority).toBeDefined();
      expect(ticket.category).toBeDefined();
      expect(ticket.metric).toBeDefined();
      expect(ticket.currentValue).toBeDefined();
      expect(ticket.targetValue).toBeDefined();
      expect(ticket.estimatedImpact).toBeDefined();
    }
  });
});

// =============================================================================
// regenerateRecommendations
// =============================================================================

// T-PERF-117-010: POST /audits/:id/recommendations/regenerate queues new AI generation
describe("T-PERF-117-010: regenerateRecommendations — happy path", () => {
  it("returns generationId and status 'queued'", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultAI());
    mockSaveSummary.mockResolvedValue(undefined);

    const result = await regenerateRecommendations("user-123", "audit-123");

    expect(result.generationId).toBeDefined();
    expect(typeof result.generationId).toBe("string");
    expect(result.generationId.length).toBeGreaterThan(0);
    expect(result.status).toBe("queued");
  });

  it("fires background regeneration that calls AI narrative service", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultAI());
    mockSaveSummary.mockResolvedValue(undefined);

    await regenerateRecommendations("user-123", "audit-123");

    // Wait for fire-and-forget to complete — both assertions inside waitFor
    await vi.waitFor(() => {
      expect(mockGenerateAISummary).toHaveBeenCalledOnce();
      expect(mockSaveSummary).toHaveBeenCalledOnce();
    });
  });

  it("clears active regeneration lock after background task completes", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockResolvedValue(makeAISummaryResultAI());
    mockSaveSummary.mockResolvedValue(undefined);

    await regenerateRecommendations("user-123", "audit-123");

    // Wait for fire-and-forget to complete
    await vi.waitFor(() => {
      expect(_getActiveRegenerations().has("audit-123")).toBe(false);
    });
  });

  it("clears active regeneration lock even when background task fails", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    // Use a promise that rejects but is caught by the fire-and-forget try/catch
    mockGenerateAISummary.mockImplementation(() => Promise.reject(new Error("OpenAI down")));

    await regenerateRecommendations("user-123", "audit-123");

    // Wait for fire-and-forget to complete (even on error — finally block clears lock)
    await vi.waitFor(() => {
      expect(_getActiveRegenerations().has("audit-123")).toBe(false);
    });
  });
});

// T-PERF-117-011: POST /audits/:id/recommendations/regenerate while active generation returns 409
describe("T-PERF-117-011: regenerateRecommendations — conflict", () => {
  it("throws 409 AUDIT_CONFLICT when regeneration is already in progress", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    // Simulate an active regeneration by never resolving the AI call
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());
    mockGenerateAISummary.mockReturnValue(new Promise(() => {})); // Never resolves

    // First call succeeds
    await regenerateRecommendations("user-123", "audit-123");

    // Second call should throw 409
    await expect(regenerateRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 409,
        code: "AUDIT_CONFLICT",
        message: "A regeneration is already in progress for this audit.",
      },
    });
  });
});

// Regenerate: auth/status checks
describe("regenerateRecommendations — auth/status checks", () => {
  it("throws 404 for non-existent audit", async () => {
    mockGetAuditJob.mockResolvedValue(null);

    await expect(regenerateRecommendations("user-123", "nonexistent")).rejects.toMatchObject({
      name: "AppError",
      envelope: { status: 404, code: "AUDIT_NOT_FOUND" },
    });
  });

  it("throws 403 for another user's audit", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ uid: "other-user" }));

    await expect(regenerateRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: { status: 403, code: "AUDIT_FORBIDDEN" },
    });
  });

  it("throws 400 for non-completed audit", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ status: "failed" }));

    await expect(regenerateRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: { status: 400, code: "AUDIT_NOT_COMPLETED" },
    });
  });

  it("throws 500 for completed audit with missing metrics", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ metrics: undefined }));

    await expect(regenerateRecommendations("user-123", "audit-123")).rejects.toMatchObject({
      name: "AppError",
      envelope: { status: 500, code: "INTERNAL_ERROR" },
    });
  });
});
