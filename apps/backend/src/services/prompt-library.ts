import { createHash } from "node:crypto";
import type { RuleEngineOutput } from "../domain/recommendation.js";

/** Human-readable prompt version identifier per ADR-013 versioning strategy. */
export const PROMPT_VERSION = "v1";

/**
 * System prompt v1 — exact text from ADR-013 §System Prompt v1.
 * Defines the AI's role, audience, and constraints.
 * Changes require code review and deployment (intentional for auditability).
 */
export const SYSTEM_PROMPT_V1 = `You are a senior web performance consultant writing for two audiences:

1. EXECUTIVE SUMMARY: Write for a non-technical stakeholder (product manager,
   marketing lead, or agency client). Explain what the performance issues mean
   for their business — user experience, conversion rates, SEO rankings. Use
   plain language. No jargon. 2-3 paragraphs.

2. DEVELOPER TICKETS: Write for a frontend engineer who will fix the issues.
   Each ticket must be actionable, specific, and self-contained. Include the
   metric name, current value, target value, and step-by-step fix instructions.

RULES:
- Use ONLY the data provided in the user message. Do not hallucinate metrics,
  URLs, or recommendations not present in the input.
- Every ticket MUST correspond to exactly one item in the provided issue list.
  Do not add, remove, or reorder items.
- Cite specific metric values (e.g., "LCP is 3.2 seconds, which exceeds the
  2.5-second threshold").
- Priority values (P0-P3) must match the input exactly.
- Category values must match the input exactly.
- Output valid JSON matching the provided schema. No markdown, no commentary
  outside the JSON structure.`;

/**
 * User prompt template v1 — exact template from ADR-013 §User Prompt Template v1.
 * Placeholders are replaced by buildUserPrompt().
 */
export const USER_PROMPT_TEMPLATE_V1 = `Audit results for: {url}
Strategy: {strategy}
Performance score: {performanceScore}/100
Audited at: {fetchedAt}

## CWV Metrics
LCP: {lcp}ms (rating: {lcpRating})
CLS: {cls} (rating: {clsRating})
TBT: {tbt}ms (rating: {tbtRating})
FCP: {fcp}ms (rating: {fcpRating})
TTFB: {ttfb}ms (rating: {ttfbRating})
Speed Index: {si}ms

## Prioritized Issues (from rule engine — do not modify)
{issueListJson}

## Output Schema
{outputSchemaJson}

Generate the executive summary and developer tickets based on the above data.`;

/**
 * JSON schema description for the AI output — included in the user prompt
 * so the model knows the expected response structure.
 */
const OUTPUT_SCHEMA_DESCRIPTION = JSON.stringify(
  {
    executiveSummary: "string (100-3000 chars, business-friendly, 2-3 paragraphs)",
    tickets: [
      {
        title: "string (10-200 chars)",
        description: "string (50-1000 chars)",
        priority: "P0 | P1 | P2 | P3 (must match input)",
        category:
          "loading | interactivity | visual-stability | server | rendering (must match input)",
        metric: "string (metric name from input)",
        currentValue: "string (e.g., '3.2s')",
        targetValue: "string (e.g., '<2.5s')",
        estimatedImpact: "critical | high | medium | low",
        suggestedFix: "string (50-2000 chars, step-by-step instructions)",
      },
    ],
  },
  null,
  2
);

/**
 * Metric ratings lookup for user prompt template.
 * Maps metric values to their ratings using the same thresholds as the rule engine.
 */
interface MetricRatings {
  lcpRating: string;
  clsRating: string;
  tbtRating: string;
  fcpRating: string;
  ttfbRating: string;
}

function computeRating(value: number | null, goodBelow: number, poorAbove: number): string {
  if (value === null) return "N/A";
  if (value < goodBelow) return "good";
  if (value > poorAbove) return "poor";
  return "needs-improvement";
}

function computeMetricRatings(metrics: {
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  fcp: number | null;
  ttfb: number | null;
}): MetricRatings {
  return {
    lcpRating: computeRating(metrics.lcp, 2500, 4000),
    clsRating: computeRating(metrics.cls, 0.1, 0.25),
    tbtRating: computeRating(metrics.tbt, 200, 600),
    fcpRating: computeRating(metrics.fcp, 1800, 3000),
    ttfbRating: computeRating(metrics.ttfb, 800, 1800),
  };
}

/**
 * Build the complete user prompt from audit data and rule engine output.
 * Replaces all template placeholders with actual values.
 *
 * @param url - The audited URL
 * @param strategy - Audit strategy (mobile/desktop)
 * @param metrics - CWV metrics from the audit
 * @param ruleEngineOutput - Deterministic recommendations from the rule engine
 * @returns The fully populated user prompt string
 */
export function buildUserPrompt(
  url: string,
  strategy: string,
  metrics: {
    lcp: number | null;
    cls: number | null;
    tbt: number | null;
    fcp: number | null;
    ttfb: number | null;
    si: number | null;
    performanceScore: number | null;
    fetchedAt: string;
  },
  ruleEngineOutput: RuleEngineOutput[]
): string {
  const ratings = computeMetricRatings(metrics);
  const performanceScoreDisplay =
    metrics.performanceScore !== null ? Math.round(metrics.performanceScore * 100) : "N/A";

  return USER_PROMPT_TEMPLATE_V1.replace("{url}", url)
    .replace("{strategy}", strategy)
    .replace("{performanceScore}", String(performanceScoreDisplay))
    .replace("{fetchedAt}", metrics.fetchedAt)
    .replace("{lcp}", String(metrics.lcp ?? "N/A"))
    .replace("{cls}", String(metrics.cls ?? "N/A"))
    .replace("{tbt}", String(metrics.tbt ?? "N/A"))
    .replace("{fcp}", String(metrics.fcp ?? "N/A"))
    .replace("{ttfb}", String(metrics.ttfb ?? "N/A"))
    .replace("{si}", String(metrics.si ?? "N/A"))
    .replace("{lcpRating}", ratings.lcpRating)
    .replace("{clsRating}", ratings.clsRating)
    .replace("{tbtRating}", ratings.tbtRating)
    .replace("{fcpRating}", ratings.fcpRating)
    .replace("{ttfbRating}", ratings.ttfbRating)
    .replace("{issueListJson}", JSON.stringify(ruleEngineOutput, null, 2))
    .replace("{outputSchemaJson}", OUTPUT_SCHEMA_DESCRIPTION);
}

/**
 * Compute SHA-256 hash of a string. Used for prompt hash and input hash tracking
 * per ADR-013 versioning strategy.
 */
export function computeHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
