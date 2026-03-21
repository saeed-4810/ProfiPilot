import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditJob, AuditMetrics } from "../src/domain/audit.js";
import type { AISummaryResult, AITicket, RuleEngineOutput } from "../src/domain/recommendation.js";

// --- Mock modules ---
const mockGetAuditJob = vi.fn();
const mockGetSummary = vi.fn();
const mockGenerateRecommendations = vi.fn();

vi.mock("../src/adapters/firestore-audit.js", () => ({
  getAuditJob: (...args: unknown[]) => mockGetAuditJob(...args),
}));

vi.mock("../src/adapters/firestore-summary.js", () => ({
  getSummary: (...args: unknown[]) => mockGetSummary(...args),
}));

vi.mock("../src/services/rule-engine.js", () => ({
  generateRecommendations: (...args: unknown[]) => mockGenerateRecommendations(...args),
  formatMetricValue: vi.fn((value: number, unit: string) => {
    if (unit === "score") return String(value);
    return `${(value / 1000).toFixed(1)}s`;
  }),
  getTargetValue: vi.fn((metric: string) => {
    const targets: Record<string, string> = {
      lcp: "<2500ms",
      cls: "<0.1",
      tbt: "<200ms",
      fcp: "<1800ms",
      ttfb: "<800ms",
    };
    return targets[metric] ?? "N/A";
  }),
}));

// Mock export-renderer to isolate service logic from rendering
const mockRenderExportMarkdown = vi.fn();
vi.mock("../src/services/export-renderer.js", () => ({
  renderExportMarkdown: (...args: unknown[]) => mockRenderExportMarkdown(...args),
  TEMPLATE_VERSION: "v1",
}));

const { generateExport, validateExportFormat } = await import("../src/services/export-service.js");
const { AppError } = await import("../src/domain/errors.js");

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

beforeEach(() => {
  vi.clearAllMocks();
  mockRenderExportMarkdown.mockReturnValue(
    "# Web Performance Audit Report\n\n**URL:** https://example.com"
  );
});

// =============================================================================
// validateExportFormat
// =============================================================================

// T-PERF-118-002: GET ?format=pdf → 422 EXPORT_FORMAT_INVALID
describe("T-PERF-118-002: validateExportFormat — pdf returns 422", () => {
  it("throws 422 EXPORT_FORMAT_INVALID for format=pdf", () => {
    expect(() => validateExportFormat("pdf")).toThrow(AppError);
    try {
      validateExportFormat("pdf");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as InstanceType<typeof AppError>;
      expect(appErr.envelope.status).toBe(422);
      expect(appErr.envelope.code).toBe("EXPORT_FORMAT_INVALID");
    }
  });

  it("throws 422 for unknown format", () => {
    expect(() => validateExportFormat("csv")).toThrow(AppError);
    try {
      validateExportFormat("csv");
    } catch (err) {
      const appErr = err as InstanceType<typeof AppError>;
      expect(appErr.envelope.status).toBe(422);
      expect(appErr.envelope.code).toBe("EXPORT_FORMAT_INVALID");
    }
  });

  it("accepts format=md", () => {
    expect(validateExportFormat("md")).toBe("md");
  });

  it("accepts format=MD (case-insensitive)", () => {
    expect(validateExportFormat("MD")).toBe("md");
  });

  it("defaults to md when format is undefined", () => {
    expect(validateExportFormat(undefined)).toBe("md");
  });
});

// =============================================================================
// generateExport — access validation
// =============================================================================

// T-PERF-118-004: Non-existent audit → 404 AUDIT_NOT_FOUND
describe("T-PERF-118-004: generateExport — non-existent audit", () => {
  it("throws 404 AUDIT_NOT_FOUND when audit does not exist", async () => {
    mockGetAuditJob.mockResolvedValue(null);

    await expect(generateExport("user-123", "nonexistent", "md")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 404,
        code: "AUDIT_NOT_FOUND",
        message: "Audit job not found.",
      },
    });
  });
});

// T-PERF-118-005: Other user's audit → 403 AUDIT_FORBIDDEN
describe("T-PERF-118-005: generateExport — forbidden", () => {
  it("throws 403 AUDIT_FORBIDDEN when uid does not match", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ uid: "other-user" }));

    await expect(generateExport("user-123", "audit-123", "md")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 403,
        code: "AUDIT_FORBIDDEN",
        message: "You do not have access to this audit job.",
      },
    });
  });
});

// T-PERF-118-003: In-progress audit → 400 AUDIT_NOT_COMPLETED
describe("T-PERF-118-003: generateExport — in-progress audit", () => {
  it("throws 400 AUDIT_NOT_COMPLETED for non-completed audit", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ status: "running" }));

    await expect(generateExport("user-123", "audit-123", "md")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 400,
        code: "AUDIT_NOT_COMPLETED",
        message: "Audit is still processing, results not yet available.",
      },
    });
  });
});

// Edge case: completed audit with missing metrics → 500 INTERNAL_ERROR
describe("generateExport — completed audit with missing metrics", () => {
  it("throws 500 INTERNAL_ERROR when metrics are missing", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ metrics: undefined }));

    await expect(generateExport("user-123", "audit-123", "md")).rejects.toMatchObject({
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
// generateExport — happy path with AI summary
// =============================================================================

// T-PERF-118-007: Export includes metadata (URL, date, strategy, score in header)
describe("T-PERF-118-007: generateExport — export includes metadata", () => {
  it("passes correct job metadata to renderer", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    await generateExport("user-123", "audit-123", "md");

    expect(mockRenderExportMarkdown).toHaveBeenCalledOnce();
    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    expect(input.job.url).toBe("https://example.com");
    expect(input.job.strategy).toBe("mobile");
    expect(input.job.completedAt).toBe("2026-03-17T00:05:00.000Z");
    expect(input.metrics.performanceScore).toBe(0.65);
    expect(input.metrics.lcp).toBe(3500);
  });
});

// T-PERF-118-008: Export includes all tickets (count matches recommendations)
describe("T-PERF-118-008: generateExport — export includes all tickets", () => {
  it("passes AI summary with all tickets to renderer", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    await generateExport("user-123", "audit-123", "md");

    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    expect(input.summary.tickets).toHaveLength(1);
    expect(input.summary.tickets[0].title).toBe("Optimize Largest Contentful Paint (LCP)");
  });
});

// T-PERF-118-009: Export includes AI summary when available
describe("T-PERF-118-009: generateExport — AI summary present", () => {
  it("passes AI summary with executiveSummary to renderer", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    await generateExport("user-123", "audit-123", "md");

    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    expect(input.summary.aiAvailable).toBe(true);
    expect(input.summary.executiveSummary).toContain("performance needs improvement");
  });
});

// T-PERF-118-010: AI unavailable → placeholder ("AI summary not available")
describe("T-PERF-118-010: generateExport — AI unavailable fallback", () => {
  it("builds fallback summary with rule engine output when no AI summary exists", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());

    await generateExport("user-123", "audit-123", "md");

    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    expect(input.summary.aiAvailable).toBe(false);
    expect(input.summary.executiveSummary).toBeNull();
    expect(input.summary.fallbackReason).toBe("openai_unavailable");
    expect(input.summary.tickets).toEqual(makeRuleEngineOutput());
  });

  it("calls rule engine with audit metrics for fallback", async () => {
    const metrics = makeMetrics();
    mockGetAuditJob.mockResolvedValue(makeCompletedJob({ metrics }));
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());

    await generateExport("user-123", "audit-123", "md");

    expect(mockGenerateRecommendations).toHaveBeenCalledOnce();
    expect(mockGenerateRecommendations).toHaveBeenCalledWith(metrics);
  });
});

// =============================================================================
// generateExport — product scenarios
// =============================================================================

// P-PERF-118-001: User downloads complete report (metadata + summary + tickets)
describe("P-PERF-118-001: generateExport — complete report", () => {
  it("returns rendered markdown string from renderer", async () => {
    const expectedMarkdown = "# Web Performance Audit Report\n\n**URL:** https://example.com";
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());
    mockRenderExportMarkdown.mockReturnValue(expectedMarkdown);

    const result = await generateExport("user-123", "audit-123", "md");

    expect(result).toBe(expectedMarkdown);
    expect(mockRenderExportMarkdown).toHaveBeenCalledOnce();
  });

  it("passes complete ExportInput with job, metrics, and summary", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    await generateExport("user-123", "audit-123", "md");

    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    // Job metadata
    expect(input.job).toBeDefined();
    expect(input.job.url).toBeDefined();
    expect(input.job.strategy).toBeDefined();
    // Metrics
    expect(input.metrics).toBeDefined();
    expect(input.metrics.lcp).toBeDefined();
    expect(input.metrics.performanceScore).toBeDefined();
    // Summary
    expect(input.summary).toBeDefined();
    expect(input.summary.tickets).toBeDefined();
  });
});

// P-PERF-118-002: Report readable by developer (clear titles, descriptions, fixes)
describe("P-PERF-118-002: generateExport — developer-readable report", () => {
  it("passes AI tickets with title, description, and suggestedFix to renderer", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(makeAISummaryResultAI());

    await generateExport("user-123", "audit-123", "md");

    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    const ticket = input.summary.tickets[0];
    expect(ticket.title).toBe("Optimize Largest Contentful Paint (LCP)");
    expect(ticket.description).toContain("LCP is 3.5 seconds");
    expect(ticket.suggestedFix).toContain("Compress and serve images");
  });

  it("passes rule engine output with ruleId, metric, and suggestedFix in fallback", async () => {
    mockGetAuditJob.mockResolvedValue(makeCompletedJob());
    mockGetSummary.mockResolvedValue(null);
    mockGenerateRecommendations.mockReturnValue(makeRuleEngineOutput());

    await generateExport("user-123", "audit-123", "md");

    const input = mockRenderExportMarkdown.mock.calls[0]![0];
    const ticket = input.summary.tickets[0];
    expect(ticket.ruleId).toBe("CWV-LCP-001");
    expect(ticket.metric).toBe("lcp");
    expect(ticket.suggestedFix).toBe("Optimize LCP element.");
  });
});

// =============================================================================
// generateExport — format validation integration
// =============================================================================

describe("generateExport — format validation", () => {
  it("throws 422 for format=pdf before checking audit access", async () => {
    // Should not even call getAuditJob
    await expect(generateExport("user-123", "audit-123", "pdf")).rejects.toMatchObject({
      name: "AppError",
      envelope: {
        status: 422,
        code: "EXPORT_FORMAT_INVALID",
      },
    });

    expect(mockGetAuditJob).not.toHaveBeenCalled();
  });
});
