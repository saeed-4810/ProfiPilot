import { describe, it, expect } from "vitest";
import type { AuditMetrics } from "../src/domain/audit.js";
import type {
  AITicket,
  RuleEngineOutput,
  AISummaryResult,
  GenerationMetadata,
} from "../src/domain/recommendation.js";
import { AITicketSchema } from "../src/domain/recommendation.js";
import {
  renderExportMarkdown,
  mapPriorityLabel,
  mapCategoryLabel,
  escapeMarkdown,
  computeMetricRating,
  mapTicketsToDisplay,
  TEMPLATE_VERSION,
} from "../src/services/export-renderer.js";
import type { ExportInput } from "../src/services/export-renderer.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMetrics(overrides: Partial<AuditMetrics> = {}): AuditMetrics {
  return {
    lcp: 3200,
    cls: 0.15,
    tbt: 450,
    fcp: 2200,
    ttfb: 1500,
    si: 3000,
    performanceScore: 0.65,
    lighthouseVersion: "12.0.0",
    fieldData: null,
    fetchedAt: "2026-03-21T12:00:00.000Z",
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<GenerationMetadata> = {}): GenerationMetadata {
  return {
    modelVersion: "gpt-4o-2024-08-06",
    promptHash: "abc123",
    promptVersion: "v1.0",
    temperature: 0.3,
    inputHash: "def456",
    generatedAt: "2026-03-21T12:05:00.000Z",
    latencyMs: 2500,
    inputTokens: 1200,
    outputTokens: 800,
    costUsd: 0.015,
    ...overrides,
  };
}

function makeAITicket(overrides: Partial<AITicket> = {}): AITicket {
  return {
    title: "Optimize LCP by compressing hero image and using modern formats",
    description:
      "The largest contentful paint element is a hero image that takes 3.2 seconds to render. This exceeds the 2.5s threshold and impacts user experience.",
    priority: "P1",
    category: "loading",
    metric: "lcp",
    currentValue: "3.2s",
    targetValue: "<2.5s",
    estimatedImpact: "high",
    suggestedFix:
      "Compress the hero image using WebP or AVIF format. Add width and height attributes. Preload the LCP resource with link rel=preload.",
    ...overrides,
  };
}

function makeRuleOutput(overrides: Partial<RuleEngineOutput> = {}): RuleEngineOutput {
  return {
    ruleId: "CWV-LCP-001",
    metric: "lcp",
    value: 3200,
    unit: "ms",
    rating: "needs-improvement",
    severity: "P2",
    category: "loading",
    suggestedFix:
      "Optimize largest contentful paint element: compress and serve images in modern formats (WebP/AVIF), preload the LCP resource, reduce server response time, and eliminate render-blocking resources.",
    evidence: {
      threshold: 2500,
      actual: 3200,
      delta: "+700ms",
    },
    ...overrides,
  };
}

function makeAISummary(overrides: Partial<AISummaryResult> = {}): AISummaryResult {
  return {
    auditId: "audit-001",
    executiveSummary:
      "This site has moderate performance issues. The LCP is above the recommended threshold, and interactivity could be improved. Addressing these issues could improve conversion rates by 10-15%.",
    tickets: [makeAITicket()],
    aiAvailable: true,
    metadata: makeMetadata(),
    ...overrides,
  };
}

function makeFallbackSummary(overrides: Partial<AISummaryResult> = {}): AISummaryResult {
  return {
    auditId: "audit-001",
    executiveSummary: null,
    tickets: [makeRuleOutput()],
    aiAvailable: false,
    fallbackReason: "openai_unavailable",
    ...overrides,
  };
}

function makeExportInput(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    job: {
      url: "https://example.com",
      strategy: "mobile",
      completedAt: "2026-03-21T12:00:00.000Z",
      updatedAt: "2026-03-21T11:55:00.000Z",
    },
    metrics: makeMetrics(),
    summary: makeAISummary(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// P-PERF-114-001: Rule engine output -> structured tickets
// ---------------------------------------------------------------------------

describe("P-PERF-114-001: Rule engine output maps to structured tickets", () => {
  it("maps each RuleEngineOutput to one DisplayTicket with all fields", () => {
    const outputs: RuleEngineOutput[] = [
      makeRuleOutput({ metric: "lcp", severity: "P1", category: "loading" }),
      makeRuleOutput({
        ruleId: "CWV-CLS-001",
        metric: "cls",
        value: 0.3,
        unit: "score",
        severity: "P1",
        category: "visual-stability",
        evidence: { threshold: 0.25, actual: 0.3, delta: "+0.05" },
      }),
    ];

    const summary = makeFallbackSummary({ tickets: outputs });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets).toHaveLength(2);

    expect(tickets[0]!.index).toBe(1);
    expect(tickets[0]!.title).toBe("CWV-LCP-001: lcp");
    expect(tickets[0]!.priority).toBe("P1");
    expect(tickets[0]!.priorityLabel).toBe("High");
    expect(tickets[0]!.category).toBe("loading");
    expect(tickets[0]!.categoryLabel).toBe("Loading Performance");
    expect(tickets[0]!.metric).toBe("lcp");
    expect(tickets[0]!.currentValue).toBe("3.2s");
    expect(tickets[0]!.targetValue).toBe("<2500ms");
    expect(tickets[0]!.estimatedImpact).toBe("high");
    expect(tickets[0]!.suggestedFix).toBeTruthy();
    expect(tickets[0]!.evidenceThreshold).toBe("2500");
    expect(tickets[0]!.evidenceActual).toBe("3200");
    expect(tickets[0]!.evidenceDelta).toBe("+700ms");

    expect(tickets[1]!.index).toBe(2);
    expect(tickets[1]!.metric).toBe("cls");
    expect(tickets[1]!.categoryLabel).toBe("Visual Stability");
  });

  it("maps AITicket[] when AI is available", () => {
    const aiTickets: AITicket[] = [
      makeAITicket({ priority: "P0", category: "loading" }),
      makeAITicket({
        title: "Reduce TBT by splitting long JavaScript tasks",
        priority: "P2",
        category: "interactivity",
        metric: "tbt",
        currentValue: "450ms",
        targetValue: "<200ms",
        estimatedImpact: "medium",
      }),
    ];

    const summary = makeAISummary({ tickets: aiTickets });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets).toHaveLength(2);
    expect(tickets[0]!.priorityLabel).toBe("Critical");
    expect(tickets[0]!.categoryLabel).toBe("Loading Performance");
    expect(tickets[1]!.priorityLabel).toBe("Medium");
    expect(tickets[1]!.categoryLabel).toBe("Interactivity");
  });
});

// ---------------------------------------------------------------------------
// P-PERF-114-002: Markdown export produces readable report
// ---------------------------------------------------------------------------

describe("P-PERF-114-002: Markdown export produces readable report", () => {
  it("renders report with executive summary and numbered ticket list", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    // Has executive summary section
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("moderate performance issues");

    // Has numbered recommendations
    expect(markdown).toContain("## Prioritized Recommendations");
    expect(markdown).toContain("### 1.");

    // Has all 7 sections
    expect(markdown).toContain("# Web Performance Audit Report");
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Performance Score");
    expect(markdown).toContain("## Prioritized Recommendations");
    expect(markdown).toContain("## Developer Ticket Backlog");
    expect(markdown).toContain("## Methodology");
    expect(markdown).toContain("NimbleVitals");
  });

  it("renders ticket backlog table with correct columns", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain(
      "| # | Priority | Title | Category | Metric | Current | Target | Impact |"
    );
    expect(markdown).toContain("| 1 | High |");
  });
});

// ---------------------------------------------------------------------------
// P-PERF-114-003: Empty recommendations -> "no issues found"
// ---------------------------------------------------------------------------

describe("P-PERF-114-003: Empty recommendations produce congratulatory message", () => {
  it("renders congratulatory message when no tickets exist", () => {
    const summary = makeAISummary({
      tickets: [],
      executiveSummary: "All metrics are within acceptable thresholds.",
    });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("Congratulations!");
    expect(markdown).toContain("No performance issues were found");
    expect(markdown).toContain("No tickets to display");
  });

  it("renders congratulatory message for fallback mode with empty tickets", () => {
    const summary = makeFallbackSummary({ tickets: [] });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("Congratulations!");
  });
});

// ---------------------------------------------------------------------------
// U-PERF-114-001: Priority labels human-readable
// ---------------------------------------------------------------------------

describe("U-PERF-114-001: Priority labels are human-readable", () => {
  it("maps P0 to Critical", () => {
    expect(mapPriorityLabel("P0")).toBe("Critical");
  });

  it("maps P1 to High", () => {
    expect(mapPriorityLabel("P1")).toBe("High");
  });

  it("maps P2 to Medium", () => {
    expect(mapPriorityLabel("P2")).toBe("Medium");
  });

  it("maps P3 to Low", () => {
    expect(mapPriorityLabel("P3")).toBe("Low");
  });

  it("renders priority labels in the markdown output", () => {
    const tickets: AITicket[] = [
      makeAITicket({ priority: "P0" }),
      makeAITicket({
        title: "Fix CLS by adding explicit dimensions to images and videos",
        priority: "P3",
        category: "visual-stability",
        metric: "cls",
      }),
    ];
    const summary = makeAISummary({ tickets });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("[Critical]");
    expect(markdown).toContain("[Low]");
  });
});

// ---------------------------------------------------------------------------
// U-PERF-114-002: Metric values include units
// ---------------------------------------------------------------------------

describe("U-PERF-114-002: Metric values include units", () => {
  it("formats LCP as seconds when >= 1000ms", () => {
    const output = makeRuleOutput({ value: 3200, unit: "ms", metric: "lcp" });
    const summary = makeFallbackSummary({ tickets: [output] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.currentValue).toBe("3.2s");
  });

  it("formats CLS as score with 2 decimal places", () => {
    const output = makeRuleOutput({
      ruleId: "CWV-CLS-001",
      value: 0.15,
      unit: "score",
      metric: "cls",
      category: "visual-stability",
      evidence: { threshold: 0.1, actual: 0.15, delta: "+0.05" },
    });
    const summary = makeFallbackSummary({ tickets: [output] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.currentValue).toBe("0.15");
  });

  it("formats TBT as milliseconds when < 1000ms", () => {
    const output = makeRuleOutput({
      ruleId: "CWV-TBT-001",
      value: 450,
      unit: "ms",
      metric: "tbt",
      category: "interactivity",
      evidence: { threshold: 200, actual: 450, delta: "+250ms" },
    });
    const summary = makeFallbackSummary({ tickets: [output] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.currentValue).toBe("450ms");
  });

  it("includes units in the rendered markdown score table", () => {
    const input = makeExportInput({
      metrics: makeMetrics({ lcp: 3200, cls: 0.15, tbt: 450 }),
    });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("3.2s");
    expect(markdown).toContain("0.15");
    expect(markdown).toContain("450ms");
  });
});

// ---------------------------------------------------------------------------
// U-PERF-114-003: Export includes audit metadata header
// ---------------------------------------------------------------------------

describe("U-PERF-114-003: Export includes audit metadata header", () => {
  it("renders URL, date, strategy, and score at top", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("**URL:** https://example.com");
    expect(markdown).toContain("**Audit Date:** 2026-03-21T12:00:00.000Z");
    expect(markdown).toContain("**Strategy:** mobile");
    expect(markdown).toContain(`**Template Version:** ${TEMPLATE_VERSION}`);
    expect(markdown).toContain("**Overall Score:** 65/100");
  });

  it("uses updatedAt as fallback when completedAt is undefined", () => {
    const input = makeExportInput({
      job: {
        url: "https://example.com",
        strategy: "mobile",
        completedAt: undefined,
        updatedAt: "2026-03-21T11:55:00.000Z",
      },
    });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("**Audit Date:** 2026-03-21T11:55:00.000Z");
  });

  it("renders N/A for null performance score", () => {
    const input = makeExportInput({
      metrics: makeMetrics({ performanceScore: null }),
    });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("**Overall Score:** N/A");
  });
});

// ---------------------------------------------------------------------------
// T-PERF-114-001: Zod validates all required ticket fields
// ---------------------------------------------------------------------------

describe("T-PERF-114-001: Zod validates all required ticket fields", () => {
  it("accepts a valid AITicket", () => {
    const ticket = makeAITicket();
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const ticket = makeAITicket();
    const noTitle = {
      description: ticket.description,
      priority: ticket.priority,
      category: ticket.category,
      metric: ticket.metric,
      currentValue: ticket.currentValue,
      targetValue: ticket.targetValue,
      estimatedImpact: ticket.estimatedImpact,
      suggestedFix: ticket.suggestedFix,
    };
    const result = AITicketSchema.safeParse(noTitle);

    expect(result.success).toBe(false);
  });

  it("rejects missing priority", () => {
    const ticket = makeAITicket();
    const noPriority = {
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      metric: ticket.metric,
      currentValue: ticket.currentValue,
      targetValue: ticket.targetValue,
      estimatedImpact: ticket.estimatedImpact,
      suggestedFix: ticket.suggestedFix,
    };
    const result = AITicketSchema.safeParse(noPriority);

    expect(result.success).toBe(false);
  });

  it("rejects missing metric", () => {
    const ticket = makeAITicket();
    const noMetric = {
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      category: ticket.category,
      currentValue: ticket.currentValue,
      targetValue: ticket.targetValue,
      estimatedImpact: ticket.estimatedImpact,
      suggestedFix: ticket.suggestedFix,
    };
    const result = AITicketSchema.safeParse(noMetric);

    expect(result.success).toBe(false);
  });

  it("rejects missing suggestedFix", () => {
    const ticket = makeAITicket();
    const noFix = {
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      category: ticket.category,
      metric: ticket.metric,
      currentValue: ticket.currentValue,
      targetValue: ticket.targetValue,
      estimatedImpact: ticket.estimatedImpact,
    };
    const result = AITicketSchema.safeParse(noFix);

    expect(result.success).toBe(false);
  });

  it("rejects title shorter than 10 characters", () => {
    const ticket = makeAITicket({ title: "Short" });
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });

  it("rejects suggestedFix shorter than 50 characters", () => {
    const ticket = makeAITicket({ suggestedFix: "Too short" });
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-PERF-114-002: Zod rejects invalid priority
// ---------------------------------------------------------------------------

describe("T-PERF-114-002: Zod rejects invalid priority", () => {
  it("rejects priority P4", () => {
    const ticket = { ...makeAITicket(), priority: "P4" };
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });

  it("rejects priority 'high' (string instead of enum)", () => {
    const ticket = { ...makeAITicket(), priority: "high" };
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });

  it("rejects empty priority", () => {
    const ticket = { ...makeAITicket(), priority: "" };
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-PERF-114-003: Zod rejects invalid category
// ---------------------------------------------------------------------------

describe("T-PERF-114-003: Zod rejects invalid category", () => {
  it("rejects category 'performance'", () => {
    const ticket = { ...makeAITicket(), category: "performance" };
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });

  it("rejects category 'network'", () => {
    const ticket = { ...makeAITicket(), category: "network" };
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });

  it("rejects empty category", () => {
    const ticket = { ...makeAITicket(), category: "" };
    const result = AITicketSchema.safeParse(ticket);

    expect(result.success).toBe(false);
  });

  it("accepts all valid categories", () => {
    const categories = ["loading", "interactivity", "visual-stability", "server", "rendering"];
    for (const category of categories) {
      const ticket = { ...makeAITicket(), category };
      const result = AITicketSchema.safeParse(ticket);

      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T-PERF-114-004: Template renders 1-10 tickets
// ---------------------------------------------------------------------------

describe("T-PERF-114-004: Template renders variable ticket counts (1-10)", () => {
  it("renders 1 ticket correctly", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("### 1.");
    expect(markdown).not.toContain("### 2.");
    expect(markdown).toContain("| 1 |");
  });

  it("renders 5 tickets correctly", () => {
    const tickets: AITicket[] = Array.from({ length: 5 }, (_, i) =>
      makeAITicket({
        title: `Fix performance issue number ${i + 1} with detailed description`,
        priority: (["P0", "P1", "P2", "P3", "P1"] as const)[i]!,
      })
    );
    const summary = makeAISummary({ tickets });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    for (let i = 1; i <= 5; i++) {
      expect(markdown).toContain(`### ${i}.`);
      expect(markdown).toContain(`| ${i} |`);
    }
  });

  it("renders 10 tickets correctly", () => {
    const tickets: AITicket[] = Array.from({ length: 10 }, (_, i) =>
      makeAITicket({
        title: `Fix performance issue number ${i + 1} with detailed description`,
        priority: (["P0", "P1", "P2", "P3"] as const)[i % 4]!,
      })
    );
    const summary = makeAISummary({ tickets });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    for (let i = 1; i <= 10; i++) {
      expect(markdown).toContain(`### ${i}.`);
      expect(markdown).toContain(`| ${i} |`);
    }
  });
});

// ---------------------------------------------------------------------------
// T-PERF-114-005: Template escapes special characters
// ---------------------------------------------------------------------------

describe("T-PERF-114-005: Template escapes special characters", () => {
  it("escapes pipe characters in ticket titles", () => {
    const escaped = escapeMarkdown("Fix LCP | optimize images | reduce size");

    expect(escaped).toBe("Fix LCP \\| optimize images \\| reduce size");
    expect(escaped).not.toContain(" | ");
  });

  it("escapes backtick characters", () => {
    const escaped = escapeMarkdown("Use `preload` for LCP resource");

    expect(escaped).toBe("Use \\`preload\\` for LCP resource");
  });

  it("escapes bracket characters", () => {
    const escaped = escapeMarkdown("See [web.dev](https://web.dev) for details");

    expect(escaped).toBe("See \\[web.dev\\](https://web.dev) for details");
  });

  it("escapes backslash characters", () => {
    const escaped = escapeMarkdown("path\\to\\file");

    expect(escaped).toBe("path\\\\to\\\\file");
  });

  it("escapes combined special characters in rendered markdown", () => {
    const ticket = makeAITicket({
      title: "Fix LCP | use `preload` for [hero image] optimization",
      description:
        "The hero image at path\\images uses `srcset` with [responsive] breakpoints | needs optimization for all viewports and screen sizes.",
    });
    const summary = makeAISummary({ tickets: [ticket] });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    // Pipes in ticket content should be escaped
    expect(markdown).toContain("\\|");
    // Backticks in ticket content should be escaped
    expect(markdown).toContain("\\`");
    // Brackets in ticket content should be escaped
    expect(markdown).toContain("\\[");
    expect(markdown).toContain("\\]");
  });

  it("does not double-escape already-escaped content", () => {
    const escaped = escapeMarkdown("simple text without special chars");

    expect(escaped).toBe("simple text without special chars");
  });
});

// ---------------------------------------------------------------------------
// T-PERF-114-006: Integration with CTR-009
// ---------------------------------------------------------------------------

describe("T-PERF-114-006: Integration with CTR-009 export contract", () => {
  it("accepts audit data + tickets and returns a string", () => {
    const input = makeExportInput();
    const result = renderExportMarkdown(input);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns valid markdown with AI-available summary", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    // Starts with H1
    expect(markdown).toMatch(/^# Web Performance Audit Report/);
    // Contains AI note
    expect(markdown).toContain("AI-enhanced analysis by GPT-4o");
    // Contains methodology
    expect(markdown).toContain("Enhanced by AI");
  });

  it("returns valid markdown with fallback summary", () => {
    const input = makeExportInput({ summary: makeFallbackSummary() });
    const markdown = renderExportMarkdown(input);

    // Starts with H1
    expect(markdown).toMatch(/^# Web Performance Audit Report/);
    // Contains fallback note
    expect(markdown).toContain("AI summary temporarily unavailable");
    // Contains fallback methodology
    expect(markdown).toContain("Rule-engine analysis only");
    // Contains fallback executive summary
    expect(markdown).toContain("Executive summary unavailable");
  });

  it("handles desktop strategy", () => {
    const input = makeExportInput({
      job: {
        url: "https://example.com",
        strategy: "desktop",
        completedAt: "2026-03-21T12:00:00.000Z",
        updatedAt: "2026-03-21T11:55:00.000Z",
      },
    });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("**Strategy:** desktop");
  });

  it("renders all metric rows in score table even when null", () => {
    const input = makeExportInput({
      metrics: makeMetrics({
        lcp: null,
        cls: null,
        tbt: null,
        fcp: null,
        ttfb: null,
        si: null,
      }),
    });
    const markdown = renderExportMarkdown(input);

    // All metric rows should still appear with N/A
    expect(markdown).toContain("Largest Contentful Paint (LCP)");
    expect(markdown).toContain("Cumulative Layout Shift (CLS)");
    expect(markdown).toContain("Total Blocking Time (TBT)");
    expect(markdown).toContain("First Contentful Paint (FCP)");
    expect(markdown).toContain("Time to First Byte (TTFB)");
    expect(markdown).toContain("Speed Index");
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: mapCategoryLabel, computeMetricRating, edge cases
// ---------------------------------------------------------------------------

describe("mapCategoryLabel covers all categories", () => {
  it("maps loading to Loading Performance", () => {
    expect(mapCategoryLabel("loading")).toBe("Loading Performance");
  });

  it("maps interactivity to Interactivity", () => {
    expect(mapCategoryLabel("interactivity")).toBe("Interactivity");
  });

  it("maps visual-stability to Visual Stability", () => {
    expect(mapCategoryLabel("visual-stability")).toBe("Visual Stability");
  });

  it("maps server to Server Response", () => {
    expect(mapCategoryLabel("server")).toBe("Server Response");
  });

  it("maps rendering to Rendering", () => {
    expect(mapCategoryLabel("rendering")).toBe("Rendering");
  });
});

describe("computeMetricRating", () => {
  it("returns N/A for null values", () => {
    expect(computeMetricRating("lcp", null)).toBe("N/A");
  });

  it("returns N/A for unknown metrics", () => {
    expect(computeMetricRating("unknown", 100)).toBe("N/A");
  });

  it("returns Good for values below good threshold", () => {
    expect(computeMetricRating("lcp", 2000)).toContain("Good");
  });

  it("returns Poor for values above poor threshold", () => {
    expect(computeMetricRating("lcp", 5000)).toContain("Poor");
  });

  it("returns Needs Improvement for values between thresholds", () => {
    expect(computeMetricRating("lcp", 3000)).toContain("Needs Improvement");
  });
});

describe("TEMPLATE_VERSION constant", () => {
  it("is v1", () => {
    expect(TEMPLATE_VERSION).toBe("v1");
  });
});

describe("Fallback rendering edge cases", () => {
  it("maps P0/P1 severity to high impact in fallback mode", () => {
    const outputs: RuleEngineOutput[] = [
      makeRuleOutput({ severity: "P1" }),
      makeRuleOutput({
        ruleId: "CWV-CLS-001",
        metric: "cls",
        severity: "P0",
        category: "visual-stability",
        value: 0.5,
        unit: "score",
        evidence: { threshold: 0.25, actual: 0.5, delta: "+0.25" },
      }),
    ];
    const summary = makeFallbackSummary({ tickets: outputs });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.estimatedImpact).toBe("high");
    expect(tickets[1]!.estimatedImpact).toBe("high");
  });

  it("maps P2 severity to medium impact in fallback mode", () => {
    const output = makeRuleOutput({ severity: "P2" });
    const summary = makeFallbackSummary({ tickets: [output] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.estimatedImpact).toBe("medium");
  });

  it("maps P3 severity to low impact in fallback mode", () => {
    const output = makeRuleOutput({ severity: "P3" });
    const summary = makeFallbackSummary({ tickets: [output] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.estimatedImpact).toBe("low");
  });

  it("uses ruleId:metric as title in fallback mode", () => {
    const output = makeRuleOutput({ ruleId: "CWV-TBT-001", metric: "tbt" });
    const summary = makeFallbackSummary({ tickets: [output] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.title).toBe("CWV-TBT-001: tbt");
  });

  it("sets evidence fields to N/A for AI tickets", () => {
    const summary = makeAISummary({ tickets: [makeAITicket()] });
    const tickets = mapTicketsToDisplay(summary);

    expect(tickets[0]!.evidenceThreshold).toBe("N/A");
    expect(tickets[0]!.evidenceActual).toBe("N/A");
    expect(tickets[0]!.evidenceDelta).toBe("N/A");
  });
});

describe("Methodology section rendering", () => {
  it("includes AI model info when AI is available", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("Enhanced by AI (model: gpt-4o-2024-08-06");
  });

  it("includes fallback note when AI is unavailable", () => {
    const input = makeExportInput({ summary: makeFallbackSummary() });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("Rule-engine analysis only (AI unavailable)");
  });

  it("renders 'unknown' when metadata is undefined but AI is available", () => {
    const summary = makeAISummary({ metadata: undefined });
    const input = makeExportInput({ summary });
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("AI-enhanced analysis by GPT-4o (unknown)");
    expect(markdown).toContain("Enhanced by AI (model: unknown, prompt: unknown)");
  });
});

describe("Footer rendering", () => {
  it("includes NimbleVitals attribution", () => {
    const input = makeExportInput();
    const markdown = renderExportMarkdown(input);

    expect(markdown).toContain("Report generated by");
    expect(markdown).toContain("nimblevitals.app");
    expect(markdown).toContain("Turn audits into engineering tickets in minutes");
  });
});
