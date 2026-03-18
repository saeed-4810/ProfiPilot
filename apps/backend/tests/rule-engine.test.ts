import { describe, it, expect } from "vitest";
import type { AuditMetrics } from "../src/domain/audit.js";
import {
  generateRecommendations,
  formatMetricValue,
  getTargetValue,
} from "../src/services/rule-engine.js";

/** Helper: create a full AuditMetrics object with overrides. */
function makeMetrics(overrides: Partial<AuditMetrics> = {}): AuditMetrics {
  return {
    lcp: 1500,
    cls: 0.05,
    tbt: 100,
    fcp: 1200,
    ttfb: 400,
    si: 2000,
    performanceScore: 0.95,
    lighthouseVersion: "12.0.0",
    fieldData: null,
    fetchedAt: "2026-03-18T12:00:00.000Z",
    ...overrides,
  };
}

// T-AI-001: Rule engine with all metrics "good" → empty recommendations
describe("T-AI-001: Rule engine with all metrics good", () => {
  it("returns empty recommendations array when all metrics are good", () => {
    const metrics = makeMetrics({
      lcp: 1500, // good < 2500
      cls: 0.05, // good < 0.1
      tbt: 100, // good < 200
      fcp: 1200, // good < 1800
      ttfb: 400, // good < 800
    });

    const result = generateRecommendations(metrics);

    expect(result).toEqual([]);
  });

  it("returns empty when all metrics are at boundary (just below good threshold)", () => {
    const metrics = makeMetrics({
      lcp: 2499,
      cls: 0.099,
      tbt: 199,
      fcp: 1799,
      ttfb: 799,
    });

    const result = generateRecommendations(metrics);

    expect(result).toEqual([]);
  });
});

// T-AI-002: Rule engine with LCP "poor" (5000ms)
describe("T-AI-002: Rule engine with LCP poor", () => {
  it("returns P1 recommendation with ruleId CWV-LCP-001, category loading", () => {
    const metrics = makeMetrics({ lcp: 5000 });

    const result = generateRecommendations(metrics);

    const lcpRec = result.find((r) => r.metric === "lcp");
    expect(lcpRec).toBeDefined();
    expect(lcpRec!.ruleId).toBe("CWV-LCP-001");
    expect(lcpRec!.severity).toBe("P1");
    expect(lcpRec!.category).toBe("loading");
    expect(lcpRec!.rating).toBe("poor");
    expect(lcpRec!.value).toBe(5000);
    expect(lcpRec!.unit).toBe("ms");
    expect(lcpRec!.evidence.threshold).toBe(4000);
    expect(lcpRec!.evidence.actual).toBe(5000);
    expect(lcpRec!.evidence.delta).toBe("+1000ms");
  });
});

// T-AI-003: Rule engine with mixed ratings
describe("T-AI-003: Rule engine with mixed ratings", () => {
  it("maps poor → P1 and needs-improvement → P2 correctly", () => {
    const metrics = makeMetrics({
      lcp: 5000, // poor → P1
      cls: 0.15, // needs-improvement → P2
      tbt: 100, // good → skip
      fcp: 2500, // needs-improvement → P2
      ttfb: 2000, // poor → P1
    });

    const result = generateRecommendations(metrics);

    expect(result).toHaveLength(4);

    const lcp = result.find((r) => r.metric === "lcp")!;
    expect(lcp.severity).toBe("P1");
    expect(lcp.rating).toBe("poor");

    const cls = result.find((r) => r.metric === "cls")!;
    expect(cls.severity).toBe("P2");
    expect(cls.rating).toBe("needs-improvement");
    expect(cls.category).toBe("visual-stability");

    const fcp = result.find((r) => r.metric === "fcp")!;
    expect(fcp.severity).toBe("P2");
    expect(fcp.rating).toBe("needs-improvement");
    expect(fcp.category).toBe("loading");

    const ttfb = result.find((r) => r.metric === "ttfb")!;
    expect(ttfb.severity).toBe("P1");
    expect(ttfb.rating).toBe("poor");
    expect(ttfb.category).toBe("server");
  });

  it("correctly categorizes TBT as interactivity", () => {
    const metrics = makeMetrics({ tbt: 700 });

    const result = generateRecommendations(metrics);

    const tbt = result.find((r) => r.metric === "tbt")!;
    expect(tbt.category).toBe("interactivity");
    expect(tbt.ruleId).toBe("CWV-TBT-001");
  });
});

// T-AI-004: Same metrics input twice → identical output (determinism)
describe("T-AI-004: Determinism test", () => {
  it("produces identical output for the same input", () => {
    const metrics = makeMetrics({
      lcp: 3200,
      cls: 0.3,
      tbt: 450,
      fcp: 2200,
      ttfb: 1500,
    });

    const result1 = generateRecommendations(metrics);
    const result2 = generateRecommendations(metrics);

    expect(result1).toEqual(result2);
  });

  it("produces identical output across multiple calls with all-poor metrics", () => {
    const metrics = makeMetrics({
      lcp: 6000,
      cls: 0.5,
      tbt: 800,
      fcp: 4000,
      ttfb: 2500,
    });

    const results = Array.from({ length: 10 }, () => generateRecommendations(metrics));

    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// Edge cases: null metrics, boundary values
describe("Rule engine edge cases", () => {
  it("skips null metrics gracefully", () => {
    const metrics = makeMetrics({
      lcp: null,
      cls: null,
      tbt: null,
      fcp: null,
      ttfb: null,
    });

    const result = generateRecommendations(metrics);

    expect(result).toEqual([]);
  });

  it("handles mix of null and non-null metrics", () => {
    const metrics = makeMetrics({
      lcp: null,
      cls: 0.3, // poor
      tbt: null,
      fcp: 2500, // needs-improvement
      ttfb: null,
    });

    const result = generateRecommendations(metrics);

    expect(result).toHaveLength(2);
    expect(result[0]!.metric).toBe("cls");
    expect(result[1]!.metric).toBe("fcp");
  });

  it("handles exact boundary values (at poor threshold)", () => {
    // At the boundary: value === poorAbove → needs-improvement (not poor)
    // because poor is strictly > poorAbove
    const metrics = makeMetrics({
      lcp: 4000, // exactly at poor boundary → needs-improvement
      cls: 0.25, // exactly at poor boundary → needs-improvement
      tbt: 600, // exactly at poor boundary → needs-improvement
      fcp: 3000, // exactly at poor boundary → needs-improvement
      ttfb: 1800, // exactly at poor boundary → needs-improvement
    });

    const result = generateRecommendations(metrics);

    expect(result).toHaveLength(5);
    for (const rec of result) {
      expect(rec.rating).toBe("needs-improvement");
      expect(rec.severity).toBe("P2");
    }
  });

  it("handles exact good boundary values", () => {
    // At the boundary: value === goodBelow → needs-improvement (not good)
    // because good is strictly < goodBelow
    const metrics = makeMetrics({
      lcp: 2500, // exactly at good boundary → needs-improvement
      cls: 0.1, // exactly at good boundary → needs-improvement
      tbt: 200, // exactly at good boundary → needs-improvement
      fcp: 1800, // exactly at good boundary → needs-improvement
      ttfb: 800, // exactly at good boundary → needs-improvement
    });

    const result = generateRecommendations(metrics);

    expect(result).toHaveLength(5);
    for (const rec of result) {
      expect(rec.rating).toBe("needs-improvement");
      expect(rec.severity).toBe("P2");
    }
  });

  it("includes suggestedFix text for each metric", () => {
    const metrics = makeMetrics({
      lcp: 5000,
      cls: 0.3,
      tbt: 700,
      fcp: 3500,
      ttfb: 2000,
    });

    const result = generateRecommendations(metrics);

    for (const rec of result) {
      expect(rec.suggestedFix).toBeTruthy();
      expect(rec.suggestedFix.length).toBeGreaterThan(20);
    }
  });

  it("computes delta correctly for CLS (score unit)", () => {
    const metrics = makeMetrics({ cls: 0.3 });

    const result = generateRecommendations(metrics);

    const cls = result.find((r) => r.metric === "cls")!;
    expect(cls.evidence.delta).toBe("+0.05");
    expect(cls.unit).toBe("score");
  });

  it("computes delta correctly for needs-improvement metrics", () => {
    const metrics = makeMetrics({ lcp: 3200 });

    const result = generateRecommendations(metrics);

    const lcp = result.find((r) => r.metric === "lcp")!;
    // needs-improvement: threshold is goodBelow (2500)
    expect(lcp.evidence.threshold).toBe(2500);
    expect(lcp.evidence.delta).toBe("+700ms");
  });
});

// formatMetricValue utility
describe("formatMetricValue", () => {
  it("formats score values with 2 decimal places", () => {
    expect(formatMetricValue(0.15, "score")).toBe("0.15");
  });

  it("formats millisecond values >= 1000 as seconds", () => {
    expect(formatMetricValue(3200, "ms")).toBe("3.2s");
  });

  it("formats millisecond values < 1000 as ms", () => {
    expect(formatMetricValue(450, "ms")).toBe("450ms");
  });

  it("rounds millisecond values", () => {
    expect(formatMetricValue(449.7, "ms")).toBe("450ms");
  });
});

// getTargetValue utility
describe("getTargetValue", () => {
  it("returns correct target for known metrics", () => {
    expect(getTargetValue("lcp")).toBe("<2500ms");
    expect(getTargetValue("cls")).toBe("<0.1");
    expect(getTargetValue("tbt")).toBe("<200ms");
    expect(getTargetValue("fcp")).toBe("<1800ms");
    expect(getTargetValue("ttfb")).toBe("<800ms");
  });

  it("returns 'unknown' for unrecognized metrics", () => {
    expect(getTargetValue("nonexistent")).toBe("unknown");
  });
});
