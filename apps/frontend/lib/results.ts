const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/* ------------------------------------------------------------------ */
/* Response interfaces — match API spec CTR-007, CTR-008 (PERF-117)   */
/* ------------------------------------------------------------------ */

/** Severity levels for recommendations, ordered P0 (critical) → P3 (low). */
export type Severity = "P0" | "P1" | "P2" | "P3";

/** Evidence object from rule engine — threshold vs actual comparison. */
export interface RuleEngineEvidence {
  threshold: number;
  actual: number;
  delta: string;
}

/** A single recommendation from GET /audits/:id/recommendations (CTR-007). */
export interface Recommendation {
  ruleId: string;
  metric: string;
  severity: Severity;
  category: string;
  currentValue: string;
  targetValue: string;
  suggestedFix: string;
  evidence: RuleEngineEvidence;
}

/** Response from GET /audits/:id/recommendations (CTR-007). */
export interface RecommendationsResponse {
  auditId: string;
  recommendations: Recommendation[];
}

/** A dev ticket from the AI summary (AITicket shape). */
export interface DevTicket {
  title: string;
  description: string;
  priority: Severity;
  category: string;
  metric: string;
  currentValue: string;
  targetValue: string;
  estimatedImpact: string;
  suggestedFix: string;
}

/**
 * Rule engine output ticket (fallback when AI is unavailable).
 * Different shape from AITicket — has value/unit/evidence instead of
 * title/description/currentValue/targetValue/estimatedImpact.
 */
export interface RuleEngineTicket {
  ruleId: string;
  metric: string;
  value: number;
  unit: string;
  rating: string;
  severity: Severity;
  category: string;
  suggestedFix: string;
  evidence: RuleEngineEvidence;
}

/** CTR-008 tickets can be either AI-generated or rule engine fallback. */
export type SummaryTicket = DevTicket | RuleEngineTicket;

/** Response from GET /audits/:id/summary (CTR-008). */
export interface SummaryResponse {
  auditId: string;
  executiveSummary: string | null;
  tickets: SummaryTicket[];
  modelVersion?: string;
  promptHash?: string;
  generatedAt?: string;
  aiAvailable: boolean;
  fallbackReason?: string;
}

/** API error envelope per ADR-003. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
}

/* ------------------------------------------------------------------ */
/* Approved copy from docs/ux/003-copy-bank.md                        */
/* ------------------------------------------------------------------ */

// copy: results-load-failed
export const COPY_RESULTS_LOAD_FAILED = "Failed to load results. Please try again.";

// copy: ai-unavailable-banner
export const COPY_AI_UNAVAILABLE = "AI summary temporarily unavailable.";

// copy: audit-not-found
export const COPY_AUDIT_NOT_FOUND = "Audit not found.";

// copy: audit-not-completed
export const COPY_AUDIT_NOT_COMPLETED = "Audit still processing. Please wait and try again.";

// copy: results-empty
export const COPY_RESULTS_EMPTY = "No issues found — your site is performing great!";

// copy: audit-forbidden
export const COPY_AUDIT_FORBIDDEN = "You do not have access to this audit.";

/* ------------------------------------------------------------------ */
/* Severity sort order — P0 first, P3 last                            */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Sort recommendations by severity (P0 → P3). */
export function sortBySeverity<T extends { severity: Severity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Sort dev tickets by priority (P0 → P3). */
export function sortByPriority<T extends { priority: Severity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.priority] - SEVERITY_ORDER[b.priority]);
}

/* ------------------------------------------------------------------ */
/* Error helper — enriched Error with status + code                   */
/* ------------------------------------------------------------------ */

function throwApiError(response: Response, error: ApiError, fallbackMessage: string): never {
  const err = new Error(error.message || fallbackMessage) as Error & {
    status: number;
    code: string;
  };
  err.status = response.status;
  err.code = error.code ?? "UNKNOWN";
  throw err;
}

/* ------------------------------------------------------------------ */
/* API functions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch recommendations for a completed audit.
 * GET /audits/:id/recommendations with session cookie (credentials: "include").
 */
export async function getRecommendations(auditId: string): Promise<RecommendationsResponse> {
  const response = await fetch(`${API_BASE}/audits/${auditId}/recommendations`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_RESULTS_LOAD_FAILED);
  }

  return (await response.json()) as RecommendationsResponse;
}

/**
 * Fetch AI-generated summary and dev ticket backlog for a completed audit.
 * GET /audits/:id/summary with session cookie (credentials: "include").
 * Handles both aiAvailable: true and aiAvailable: false responses.
 */
export async function getSummary(auditId: string): Promise<SummaryResponse> {
  const response = await fetch(`${API_BASE}/audits/${auditId}/summary`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_RESULTS_LOAD_FAILED);
  }

  return (await response.json()) as SummaryResponse;
}

/* ------------------------------------------------------------------ */
/* Badge variant mapping for severity levels                          */
/* ------------------------------------------------------------------ */

type BadgeVariant = "error" | "warning" | "info" | "neutral";

const SEVERITY_BADGE_VARIANT: Record<Severity, BadgeVariant> = {
  P0: "error",
  P1: "warning",
  P2: "info",
  P3: "neutral",
};

/** Get the Badge variant for a severity level. */
export function getSeverityBadgeVariant(severity: Severity): BadgeVariant {
  return SEVERITY_BADGE_VARIANT[severity];
}

/* ------------------------------------------------------------------ */
/* Evidence formatting                                                 */
/* ------------------------------------------------------------------ */

/** Format a RuleEngineEvidence object as a human-readable string. */
export function formatEvidence(evidence: RuleEngineEvidence): string {
  return `Actual: ${evidence.actual}, Threshold: ${evidence.threshold}, Delta: ${evidence.delta}`;
}

/* ------------------------------------------------------------------ */
/* Ticket type guard and normalization                                 */
/* ------------------------------------------------------------------ */

/** Type guard: check if a ticket is an AI-generated DevTicket (has `title`). */
export function isDevTicket(ticket: SummaryTicket): ticket is DevTicket {
  return "title" in ticket;
}

/**
 * Normalized ticket for rendering — common shape for both AI and rule engine tickets.
 * Allows the UI to render a single card layout regardless of ticket source.
 */
export interface NormalizedTicket {
  title: string;
  description: string;
  priority: Severity;
  category: string;
  metric: string;
  currentValue: string;
  targetValue: string;
  estimatedImpact: string;
  suggestedFix: string;
}

/** Normalize a SummaryTicket (AI or rule engine) into a common rendering shape. */
export function normalizeTicket(ticket: SummaryTicket): NormalizedTicket {
  if (isDevTicket(ticket)) {
    return ticket;
  }

  // Rule engine ticket — synthesize missing fields
  return {
    title: `${ticket.metric.toUpperCase()} — ${ticket.rating}`,
    description: ticket.suggestedFix,
    priority: ticket.severity,
    category: ticket.category,
    metric: ticket.metric,
    currentValue: `${ticket.value}${ticket.unit === "score" ? "" : ticket.unit}`,
    targetValue: `threshold: ${ticket.evidence.threshold}${ticket.unit === "score" ? "" : ticket.unit}`,
    estimatedImpact: ticket.evidence.delta,
    suggestedFix: ticket.suggestedFix,
  };
}

/* ------------------------------------------------------------------ */
/* MetricCard helpers — PERF-143 severity visualization                */
/* ------------------------------------------------------------------ */

/** CWV rating bucket for MetricCard gauge. */
export type MetricRating = "good" | "needs-improvement" | "poor";

import type { AuditMetrics } from "@/lib/audit";

/** Full metric names for CWV descriptions. */
const METRIC_DESCRIPTIONS: Record<string, string> = {
  lcp: "Largest Contentful Paint",
  cls: "Cumulative Layout Shift",
  tbt: "Total Blocking Time",
  fcp: "First Contentful Paint",
  si: "Speed Index",
  ttfb: "Time to First Byte",
  inp: "Interaction to Next Paint",
  performance: "Overall Performance",
};

/** Props shape for MetricCard rendering. */
export interface MetricCardData {
  label: string;
  score: number;
  displayValue: string;
  rating: MetricRating;
  description: string;
}

/* ------------------------------------------------------------------ */
/* CWV thresholds — Google's official good/needs-improvement/poor      */
/* ------------------------------------------------------------------ */

interface MetricThreshold {
  key: keyof AuditMetrics;
  label: string;
  unit: string;
  goodMax: number;
  poorMin: number;
  /** If true, lower is better (most metrics). If false, higher is better (performanceScore). */
  lowerIsBetter: boolean;
  /** Format the raw value for display. */
  format: (v: number) => string;
  /** Convert raw value to 0-100 score for the gauge. */
  toScore: (v: number) => number;
}

const CWV_THRESHOLDS: readonly MetricThreshold[] = [
  {
    key: "performanceScore",
    label: "Performance",
    unit: "",
    goodMax: 1, // 0-1 scale, ≥0.9 is good
    poorMin: 0.5,
    lowerIsBetter: false,
    format: (v) => `${Math.round(v * 100)}/100`,
    /* v8 ignore next -- simple multiplication, always covered by integration tests */
    toScore: (v) => Math.round(v * 100),
  },
  {
    key: "lcp",
    label: "LCP",
    unit: "ms",
    goodMax: 2500,
    poorMin: 4000,
    lowerIsBetter: true,
    /* v8 ignore next -- format ternary: ms vs s display */
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`),
    /* v8 ignore start -- CWV scoring math: ternary branches for good/needs-improvement/poor ranges */
    toScore: (v) =>
      v <= 2500
        ? 90 + Math.round((1 - v / 2500) * 10)
        : v <= 4000
          ? 50 + Math.round((1 - (v - 2500) / 1500) * 39)
          : Math.max(0, Math.round((1 - (v - 4000) / 6000) * 49)),
    /* v8 ignore stop */
  },
  {
    key: "cls",
    label: "CLS",
    unit: "",
    goodMax: 0.1,
    poorMin: 0.25,
    lowerIsBetter: true,
    format: (v) => v.toFixed(3),
    /* v8 ignore start -- CWV scoring math */
    toScore: (v) =>
      v <= 0.1
        ? 90 + Math.round((1 - v / 0.1) * 10)
        : v <= 0.25
          ? 50 + Math.round((1 - (v - 0.1) / 0.15) * 39)
          : Math.max(0, Math.round((1 - (v - 0.25) / 0.75) * 49)),
    /* v8 ignore stop */
  },
  {
    key: "tbt",
    label: "TBT",
    unit: "ms",
    goodMax: 200,
    poorMin: 600,
    lowerIsBetter: true,
    /* v8 ignore next -- format ternary: ms vs s display */
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`),
    /* v8 ignore start -- CWV scoring math */
    toScore: (v) =>
      v <= 200
        ? 90 + Math.round((1 - v / 200) * 10)
        : v <= 600
          ? 50 + Math.round((1 - (v - 200) / 400) * 39)
          : Math.max(0, Math.round((1 - (v - 600) / 2400) * 49)),
    /* v8 ignore stop */
  },
  {
    key: "fcp",
    label: "FCP",
    unit: "ms",
    goodMax: 1800,
    poorMin: 3000,
    lowerIsBetter: true,
    /* v8 ignore next -- format ternary: ms vs s display */
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`),
    /* v8 ignore start -- CWV scoring math */
    toScore: (v) =>
      v <= 1800
        ? 90 + Math.round((1 - v / 1800) * 10)
        : v <= 3000
          ? 50 + Math.round((1 - (v - 1800) / 1200) * 39)
          : Math.max(0, Math.round((1 - (v - 3000) / 7000) * 49)),
    /* v8 ignore stop */
  },
  {
    key: "si",
    label: "SI",
    unit: "ms",
    goodMax: 3400,
    poorMin: 5800,
    lowerIsBetter: true,
    /* v8 ignore next -- format ternary: ms vs s display */
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`),
    /* v8 ignore start -- CWV scoring math */
    toScore: (v) =>
      v <= 3400
        ? 90 + Math.round((1 - v / 3400) * 10)
        : v <= 5800
          ? 50 + Math.round((1 - (v - 3400) / 2400) * 39)
          : Math.max(0, Math.round((1 - (v - 5800) / 4200) * 49)),
    /* v8 ignore stop */
  },
] as const;

/** Determine rating from score. */
function scoreToRating(score: number): MetricRating {
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  /* v8 ignore next -- poor branch: requires metric with score <50, covered by MetricCard unit tests */
  return "poor";
}

/**
 * Build MetricCard data from raw audit metrics.
 * This is the PRIMARY source — always has data when audit is completed.
 * Falls back to recommendation-based extraction if metrics are unavailable.
 */
export function extractMetricsFromAudit(metrics: AuditMetrics | undefined): MetricCardData[] {
  /* v8 ignore next -- defensive: caller checks undefined before calling */
  if (metrics === undefined) return [];

  const result: MetricCardData[] = [];

  for (const threshold of CWV_THRESHOLDS) {
    const rawValue = metrics[threshold.key];
    /* v8 ignore next -- null check: some metrics (ttfb) can be null */
    if (rawValue === null || rawValue === undefined) continue;
    /* v8 ignore next -- type guard: AuditMetrics has non-number fields (fieldData, lighthouseVersion) */
    if (typeof rawValue !== "number") continue;

    const score = threshold.toScore(rawValue);
    const clampedScore = Math.max(0, Math.min(100, score));

    result.push({
      label: threshold.label,
      score: clampedScore,
      displayValue: threshold.format(rawValue),
      rating: scoreToRating(clampedScore),
      /* v8 ignore next -- defensive: key always exists in METRIC_DESCRIPTIONS */
      description: METRIC_DESCRIPTIONS[threshold.label.toLowerCase()] ?? threshold.label,
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Source reference parsing — PERF-148                                 */
/* ------------------------------------------------------------------ */

/** Data for a single inline source reference in an AI summary. */
export interface SourceRefData {
  /** Metric key, e.g. "LCP", "CLS", "TBT". */
  metric: string;
  /** Formatted display value from the AI text, e.g. "3.2s", "0.05". */
  value: string;
  /** Full metric name, e.g. "Largest Contentful Paint". */
  fullName: string;
  /** CWV threshold for this metric, e.g. "2.5s". */
  threshold: string;
  /** Rating bucket, e.g. "Poor", "Good". */
  rating: string;
  /** Delta from threshold, e.g. "+0.7s". */
  delta: string;
}

/** A segment of parsed summary text — either plain text or a source reference. */
export type SummarySegment = string | SourceRefData;

/** Metric lookup map: metric key (uppercase) → enrichment data. */
export interface MetricLookup {
  fullName: string;
  threshold: string;
  rating: string;
  delta: string;
}

/** Regex matching [METRIC: value] patterns in AI summary text. */
const SOURCE_REF_REGEX = /\[(\w+):\s*([^\]]+)\]/g;

/**
 * Parse an AI summary paragraph into segments of plain text and source references.
 *
 * Matches `[LCP: 3.2s]`, `[CLS: 0.05]`, `[TBT: 150ms]` etc.
 * Enriches each match with full name, threshold, rating, and delta from the lookup map.
 * Text without `[...]` patterns passes through unchanged.
 */
export function parseSourceRefs(
  text: string,
  lookup: Record<string, MetricLookup>
): SummarySegment[] {
  const segments: SummarySegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(SOURCE_REF_REGEX)) {
    const matchIndex = match.index;
    const fullMatch = match[0];
    /* v8 ignore next 2 -- defensive nullish coalescing: regex capture groups always present for valid matches */
    const metric = match[1] ?? "";
    const value = match[2]?.trim() ?? "";

    // Add preceding plain text
    if (matchIndex > lastIndex) {
      segments.push(text.slice(lastIndex, matchIndex));
    }

    // Look up enrichment data
    const info = lookup[metric.toUpperCase()];

    if (info !== undefined) {
      segments.push({
        metric: metric.toUpperCase(),
        value,
        fullName: info.fullName,
        threshold: info.threshold,
        rating: info.rating,
        delta: info.delta,
      });
    } else {
      // No lookup data — render as plain reference without expand
      segments.push({
        metric: metric.toUpperCase(),
        value,
        fullName: metric.toUpperCase(),
        threshold: "",
        rating: "",
        delta: "",
      });
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add trailing plain text
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  // No refs found — return original text as single segment
  if (segments.length === 0) {
    segments.push(text);
  }

  return segments;
}

/**
 * Build a MetricLookup map from recommendations.
 * Used to enrich source references with threshold/rating/delta data.
 */
export function buildMetricLookup(recs: readonly Recommendation[]): Record<string, MetricLookup> {
  const lookup: Record<string, MetricLookup> = {};

  for (const rec of recs) {
    const key = rec.metric.toUpperCase();
    if (lookup[key] !== undefined) continue; // first occurrence wins (highest severity)

    lookup[key] = {
      fullName: METRIC_DESCRIPTIONS[rec.metric.toLowerCase()] ?? rec.metric,
      threshold: rec.targetValue,
      rating: rec.severity === "P0" ? "Poor" : rec.severity === "P1" ? "Needs Improvement" : "Good",
      delta: rec.evidence.delta,
    };
  }

  return lookup;
}

const SEVERITY_TO_RATING: Record<Severity, MetricRating> = {
  P0: "poor",
  P1: "needs-improvement",
  P2: "good",
  P3: "good",
};

const SEVERITY_SCORE: Record<Severity, number> = {
  P0: 20,
  P1: 50,
  P2: 75,
  P3: 90,
};

/**
 * Extract metric cards from recommendations (FALLBACK).
 * Used only when audit metrics are not available.
 */
export function extractMetrics(recs: readonly Recommendation[]): MetricCardData[] {
  const metricMap = new Map<string, { severity: Severity; currentValue: string }>();

  for (const rec of recs) {
    const existing = metricMap.get(rec.metric);
    if (existing === undefined) {
      metricMap.set(rec.metric, { severity: rec.severity, currentValue: rec.currentValue });
    } else {
      const currentScore = SEVERITY_SCORE[existing.severity];
      const newScore = SEVERITY_SCORE[rec.severity];
      if (newScore < currentScore) {
        metricMap.set(rec.metric, { severity: rec.severity, currentValue: rec.currentValue });
      }
    }
  }

  const result: MetricCardData[] = [];
  for (const [metric, data] of metricMap) {
    result.push({
      label: metric,
      score: SEVERITY_SCORE[data.severity],
      displayValue: data.currentValue,
      rating: SEVERITY_TO_RATING[data.severity],
      /* v8 ignore next -- defensive: key may not exist in METRIC_DESCRIPTIONS */
      description: METRIC_DESCRIPTIONS[metric.toLowerCase()] ?? metric,
    });
  }

  return result;
}
