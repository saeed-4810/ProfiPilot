import type { AuditMetrics } from "../domain/audit.js";
import type { RuleEngineOutput, MetricRating, IssueCategory } from "../domain/recommendation.js";

/**
 * CWV threshold definitions per web.dev standards (ADR-013 Layer 1).
 * Each metric has good/needs-improvement/poor boundaries.
 */
interface ThresholdConfig {
  readonly metric: string;
  readonly ruleId: string;
  readonly unit: string;
  readonly category: IssueCategory;
  readonly goodBelow: number;
  readonly poorAbove: number;
  readonly suggestedFix: string;
  readonly targetLabel: string;
}

const THRESHOLDS: readonly ThresholdConfig[] = [
  {
    metric: "lcp",
    ruleId: "CWV-LCP-001",
    unit: "ms",
    category: "loading",
    goodBelow: 2500,
    poorAbove: 4000,
    suggestedFix:
      "Optimize largest contentful paint element: compress and serve images in modern formats (WebP/AVIF), preload the LCP resource, reduce server response time, and eliminate render-blocking resources.",
    targetLabel: "<2500ms",
  },
  {
    metric: "cls",
    ruleId: "CWV-CLS-001",
    unit: "score",
    category: "visual-stability",
    goodBelow: 0.1,
    poorAbove: 0.25,
    suggestedFix:
      "Reduce cumulative layout shift: set explicit width/height on images and videos, avoid inserting content above existing content, and use CSS contain-intrinsic-size for lazy-loaded elements.",
    targetLabel: "<0.1",
  },
  {
    metric: "tbt",
    ruleId: "CWV-TBT-001",
    unit: "ms",
    category: "interactivity",
    goodBelow: 200,
    poorAbove: 600,
    suggestedFix:
      "Reduce total blocking time: break up long tasks, defer non-critical JavaScript, remove unused code, and minimize main-thread work with code splitting and lazy loading.",
    targetLabel: "<200ms",
  },
  {
    metric: "fcp",
    ruleId: "CWV-FCP-001",
    unit: "ms",
    category: "loading",
    goodBelow: 1800,
    poorAbove: 3000,
    suggestedFix:
      "Improve first contentful paint: eliminate render-blocking resources, inline critical CSS, preconnect to required origins, and reduce server response time.",
    targetLabel: "<1800ms",
  },
  {
    metric: "ttfb",
    ruleId: "CWV-TTFB-001",
    unit: "ms",
    category: "server",
    goodBelow: 800,
    poorAbove: 1800,
    suggestedFix:
      "Reduce time to first byte: optimize server-side processing, use a CDN, implement caching strategies, and consider edge computing for dynamic content.",
    targetLabel: "<800ms",
  },
] as const;

/**
 * Rate a metric value against its thresholds.
 * Pure function — no side effects, no external calls.
 */
function rateMetric(value: number, goodBelow: number, poorAbove: number): MetricRating {
  if (value < goodBelow) return "good";
  if (value > poorAbove) return "poor";
  return "needs-improvement";
}

/**
 * Map a metric rating to a severity level per ADR-013.
 * poor → P1, needs-improvement → P2, good → no recommendation (filtered out).
 */
function ratingSeverity(rating: MetricRating): "P1" | "P2" {
  return rating === "poor" ? "P1" : "P2";
}

/**
 * Format the delta between actual and threshold values.
 * Pure function — deterministic string formatting.
 * In the rule engine context, actual always exceeds threshold (positive delta)
 * because only needs-improvement/poor metrics produce recommendations.
 */
function formatDelta(actual: number, threshold: number, unit: string): string {
  const diff = actual - threshold;
  const prefix = `+`;
  if (unit === "score") {
    return `${prefix}${diff.toFixed(2)}`;
  }
  return `${prefix}${Math.round(diff)}${unit}`;
}

/**
 * Extract a metric value from AuditMetrics by metric name.
 * Returns null if the metric is not available.
 */
function getMetricValue(metrics: AuditMetrics, metric: string): number | null {
  const key = metric as keyof AuditMetrics;
  const value = metrics[key];
  if (typeof value === "number") return value;
  return null;
}

/**
 * Generate deterministic recommendations from CWV metrics per ADR-013 Layer 1.
 *
 * GUARANTEE: Same input always produces the same output.
 * No randomness. No external calls. No AI. Pure function.
 *
 * Only metrics rated "needs-improvement" or "poor" produce recommendations.
 * Metrics rated "good" are excluded (no issue to report).
 * Null metrics are skipped (data not available).
 */
export function generateRecommendations(metrics: AuditMetrics): RuleEngineOutput[] {
  const recommendations: RuleEngineOutput[] = [];

  for (const config of THRESHOLDS) {
    const value = getMetricValue(metrics, config.metric);

    if (value === null) continue;

    const rating = rateMetric(value, config.goodBelow, config.poorAbove);

    if (rating === "good") continue;

    const threshold = rating === "poor" ? config.poorAbove : config.goodBelow;

    recommendations.push({
      ruleId: config.ruleId,
      metric: config.metric,
      value,
      unit: config.unit,
      rating,
      severity: ratingSeverity(rating),
      category: config.category,
      suggestedFix: config.suggestedFix,
      evidence: {
        threshold,
        actual: value,
        delta: formatDelta(value, threshold, config.unit),
      },
    });
  }

  return recommendations;
}

/**
 * Format a metric value as a human-readable string for Firestore storage.
 * Used by the recommendation adapter for the currentValue field.
 */
export function formatMetricValue(value: number, unit: string): string {
  if (unit === "score") return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

/**
 * Get the target value label for a metric.
 * Used by the recommendation adapter for the targetValue field.
 */
export function getTargetValue(metric: string): string {
  const config = THRESHOLDS.find((t) => t.metric === metric);
  return config?.targetLabel ?? "unknown";
}
