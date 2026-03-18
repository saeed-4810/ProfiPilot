import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  SYSTEM_PROMPT_V1,
  USER_PROMPT_TEMPLATE_V1,
  PROMPT_VERSION,
  buildUserPrompt,
  computeHash,
} from "../src/services/prompt-library.js";
import type { RuleEngineOutput } from "../src/domain/recommendation.js";

// T-AI-012: Prompt hash computed correctly
describe("T-AI-012: Prompt hash computation", () => {
  it("computes SHA-256 of system prompt matching expected hash", () => {
    const expectedHash = createHash("sha256").update(SYSTEM_PROMPT_V1).digest("hex");
    const actualHash = computeHash(SYSTEM_PROMPT_V1);

    expect(actualHash).toBe(expectedHash);
    expect(actualHash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = computeHash("input-a");
    const hash2 = computeHash("input-b");

    expect(hash1).not.toBe(hash2);
  });

  it("produces identical hashes for identical inputs (deterministic)", () => {
    const hash1 = computeHash(SYSTEM_PROMPT_V1);
    const hash2 = computeHash(SYSTEM_PROMPT_V1);

    expect(hash1).toBe(hash2);
  });
});

// Prompt version
describe("Prompt version", () => {
  it("exports PROMPT_VERSION as v1", () => {
    expect(PROMPT_VERSION).toBe("v1");
  });
});

// System prompt content
describe("System prompt v1", () => {
  it("contains executive summary instructions", () => {
    expect(SYSTEM_PROMPT_V1).toContain("EXECUTIVE SUMMARY");
    expect(SYSTEM_PROMPT_V1).toContain("non-technical stakeholder");
  });

  it("contains developer ticket instructions", () => {
    expect(SYSTEM_PROMPT_V1).toContain("DEVELOPER TICKETS");
    expect(SYSTEM_PROMPT_V1).toContain("frontend engineer");
  });

  it("contains anti-hallucination rules", () => {
    expect(SYSTEM_PROMPT_V1).toContain("Do not hallucinate");
    expect(SYSTEM_PROMPT_V1).toContain("ONLY the data provided");
  });

  it("contains priority and category preservation rules", () => {
    expect(SYSTEM_PROMPT_V1).toContain("Priority values (P0-P3) must match the input exactly");
    expect(SYSTEM_PROMPT_V1).toContain("Category values must match the input exactly");
  });

  it("requires JSON output", () => {
    expect(SYSTEM_PROMPT_V1).toContain("Output valid JSON");
  });
});

// User prompt template
describe("User prompt template v1", () => {
  it("contains all required placeholders", () => {
    const placeholders = [
      "{url}",
      "{strategy}",
      "{performanceScore}",
      "{fetchedAt}",
      "{lcp}",
      "{cls}",
      "{tbt}",
      "{fcp}",
      "{ttfb}",
      "{si}",
      "{lcpRating}",
      "{clsRating}",
      "{tbtRating}",
      "{fcpRating}",
      "{ttfbRating}",
      "{issueListJson}",
      "{outputSchemaJson}",
    ];

    for (const placeholder of placeholders) {
      expect(USER_PROMPT_TEMPLATE_V1).toContain(placeholder);
    }
  });
});

// buildUserPrompt
describe("buildUserPrompt", () => {
  const sampleMetrics = {
    lcp: 3200,
    cls: 0.15,
    tbt: 100,
    fcp: 1200,
    ttfb: 400,
    si: 3000,
    performanceScore: 0.72,
    lighthouseVersion: "12.0.0",
    fieldData: null,
    fetchedAt: "2026-03-18T12:00:00.000Z",
  };

  const sampleRuleOutput: RuleEngineOutput[] = [
    {
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      value: 3200,
      unit: "ms",
      rating: "needs-improvement",
      severity: "P2",
      category: "loading",
      suggestedFix: "Optimize LCP element...",
      evidence: { threshold: 2500, actual: 3200, delta: "+700ms" },
    },
  ];

  it("replaces all placeholders with actual values", () => {
    const prompt = buildUserPrompt(
      "https://example.com",
      "mobile",
      sampleMetrics,
      sampleRuleOutput
    );

    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("mobile");
    expect(prompt).toContain("72/100"); // performanceScore * 100
    expect(prompt).toContain("2026-03-18T12:00:00.000Z");
    expect(prompt).toContain("3200");
    expect(prompt).toContain("0.15");
    expect(prompt).toContain("3000");
    expect(prompt).not.toContain("{url}");
    expect(prompt).not.toContain("{strategy}");
  });

  it("includes rule engine output as JSON", () => {
    const prompt = buildUserPrompt(
      "https://example.com",
      "mobile",
      sampleMetrics,
      sampleRuleOutput
    );

    expect(prompt).toContain("CWV-LCP-001");
    expect(prompt).toContain('"metric": "lcp"');
  });

  it("includes output schema description", () => {
    const prompt = buildUserPrompt(
      "https://example.com",
      "mobile",
      sampleMetrics,
      sampleRuleOutput
    );

    expect(prompt).toContain("executiveSummary");
    expect(prompt).toContain("tickets");
    expect(prompt).toContain("estimatedImpact");
  });

  it("computes metric ratings correctly in the prompt", () => {
    const prompt = buildUserPrompt(
      "https://example.com",
      "mobile",
      sampleMetrics,
      sampleRuleOutput
    );

    expect(prompt).toContain("(rating: needs-improvement)"); // LCP 3200 → needs-improvement
    expect(prompt).toContain("(rating: good)"); // TBT 100 → good
  });

  it("handles null metrics with N/A", () => {
    const nullMetrics = {
      ...sampleMetrics,
      lcp: null,
      cls: null,
      performanceScore: null,
      si: null,
    };

    const prompt = buildUserPrompt("https://example.com", "mobile", nullMetrics, []);

    expect(prompt).toContain("LCP: N/Ams (rating: N/A)");
    expect(prompt).toContain("CLS: N/A (rating: N/A)");
    expect(prompt).toContain("N/A/100");
    expect(prompt).toContain("Speed Index: N/Ams");
  });

  it("handles null tbt, fcp, ttfb metrics with N/A", () => {
    const nullMetrics = {
      ...sampleMetrics,
      tbt: null,
      fcp: null,
      ttfb: null,
    };

    const prompt = buildUserPrompt("https://example.com", "mobile", nullMetrics, []);

    expect(prompt).toContain("TBT: N/Ams (rating: N/A)");
    expect(prompt).toContain("FCP: N/Ams (rating: N/A)");
    expect(prompt).toContain("TTFB: N/Ams (rating: N/A)");
  });

  it("produces deterministic output for same input", () => {
    const prompt1 = buildUserPrompt(
      "https://example.com",
      "mobile",
      sampleMetrics,
      sampleRuleOutput
    );
    const prompt2 = buildUserPrompt(
      "https://example.com",
      "mobile",
      sampleMetrics,
      sampleRuleOutput
    );

    expect(prompt1).toBe(prompt2);
  });
});
