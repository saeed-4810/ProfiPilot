import { describe, it, expect, vi, beforeEach } from "vitest";
import { parsePSIResponse } from "../src/services/metrics-parser.js";
import { AuditMetricsSchema } from "../src/domain/audit.js";
import type { PSIResponse } from "../src/lib/psi-client.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));
});

/** Full valid PSI response fixture per ADR-012 metric paths. */
const validPSIResponse: PSIResponse = {
  lighthouseResult: {
    lighthouseVersion: "12.0.0",
    audits: {
      "largest-contentful-paint": { numericValue: 2500 },
      "cumulative-layout-shift": { numericValue: 0.05 },
      "total-blocking-time": { numericValue: 150 },
      "first-contentful-paint": { numericValue: 1200 },
      "server-response-time": { numericValue: 400 },
      "speed-index": { numericValue: 3000 },
    },
    categories: {
      performance: { score: 0.85 },
    },
  },
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500, category: "AVERAGE" },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
    },
  },
};

// T-ENGINE-001: Metrics parsed — lcp, cls, tbt, fcp, ttfb, si, performanceScore extracted
describe("T-ENGINE-001: parsePSIResponse (valid response)", () => {
  it("extracts all CWV metrics from a complete PSI response", () => {
    const metrics = parsePSIResponse(validPSIResponse);

    expect(metrics.lcp).toBe(2500);
    expect(metrics.cls).toBe(0.05);
    expect(metrics.tbt).toBe(150);
    expect(metrics.fcp).toBe(1200);
    expect(metrics.ttfb).toBe(400);
    expect(metrics.si).toBe(3000);
    expect(metrics.performanceScore).toBe(0.85);
    expect(metrics.lighthouseVersion).toBe("12.0.0");
    expect(metrics.fieldData).toEqual({
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500, category: "AVERAGE" },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
    });
    expect(metrics.fetchedAt).toBe("2026-03-18T12:00:00.000Z");
  });

  it("produces output that passes AuditMetricsSchema validation", () => {
    const metrics = parsePSIResponse(validPSIResponse);
    const result = AuditMetricsSchema.safeParse(metrics);

    expect(result.success).toBe(true);
  });
});

// T-ENGINE-009: Worker handles missing optional metrics (fieldData null)
describe("T-ENGINE-009: parsePSIResponse (missing optional metrics)", () => {
  it("returns null for missing fieldData when loadingExperience is absent", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        lighthouseVersion: "12.0.0",
        audits: {
          "largest-contentful-paint": { numericValue: 2500 },
          "cumulative-layout-shift": { numericValue: 0.05 },
          "total-blocking-time": { numericValue: 150 },
          "first-contentful-paint": { numericValue: 1200 },
          "server-response-time": { numericValue: 400 },
          "speed-index": { numericValue: 3000 },
        },
        categories: { performance: { score: 0.9 } },
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.fieldData).toBeNull();
    expect(metrics.lcp).toBe(2500);
  });

  it("returns null for individual metrics when audit items are missing", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        lighthouseVersion: "12.0.0",
        audits: {
          "largest-contentful-paint": { numericValue: 2500 },
          // All other audits missing
        },
        categories: { performance: { score: 0.5 } },
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.lcp).toBe(2500);
    expect(metrics.cls).toBeNull();
    expect(metrics.tbt).toBeNull();
    expect(metrics.fcp).toBeNull();
    expect(metrics.ttfb).toBeNull();
    expect(metrics.si).toBeNull();
  });

  it("returns null for performanceScore when categories are missing", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        lighthouseVersion: "12.0.0",
        audits: {},
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.performanceScore).toBeNull();
  });

  it("returns null for lighthouseVersion when missing", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        audits: {},
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.lighthouseVersion).toBeNull();
  });

  it("handles completely empty PSI response", () => {
    const response: PSIResponse = {};

    const metrics = parsePSIResponse(response);

    expect(metrics.lcp).toBeNull();
    expect(metrics.cls).toBeNull();
    expect(metrics.tbt).toBeNull();
    expect(metrics.fcp).toBeNull();
    expect(metrics.ttfb).toBeNull();
    expect(metrics.si).toBeNull();
    expect(metrics.performanceScore).toBeNull();
    expect(metrics.lighthouseVersion).toBeNull();
    expect(metrics.fieldData).toBeNull();
    expect(metrics.fetchedAt).toBe("2026-03-18T12:00:00.000Z");

    // Still passes schema validation
    const result = AuditMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it("returns null when audit item exists but numericValue is undefined", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        audits: {
          "largest-contentful-paint": { score: 0.5 },
        },
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.lcp).toBeNull();
  });

  it("returns null for fieldData when loadingExperience exists but metrics is undefined", () => {
    const response: PSIResponse = {
      lighthouseResult: { audits: {} },
      loadingExperience: {},
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.fieldData).toBeNull();
  });

  it("handles performanceScore of 0 correctly (not treated as null)", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        audits: {},
        categories: { performance: { score: 0 } },
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.performanceScore).toBe(0);
  });

  it("handles performanceScore of null correctly", () => {
    const response: PSIResponse = {
      lighthouseResult: {
        audits: {},
        categories: { performance: { score: null } },
      },
    };

    const metrics = parsePSIResponse(response);

    expect(metrics.performanceScore).toBeNull();
  });
});
