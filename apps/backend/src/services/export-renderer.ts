import type { AuditJob, AuditMetrics } from "../domain/audit.js";
import type {
  AITicket,
  RuleEngineOutput,
  AISummaryResult,
  IssueCategory,
  Severity,
} from "../domain/recommendation.js";
import { formatMetricValue, getTargetValue } from "./rule-engine.js";

/**
 * Template version constant per ADR-015 §3.
 * Bump on any structural change to the markdown template.
 */
export const TEMPLATE_VERSION = "v1";

/**
 * Input shape for the markdown export renderer.
 * Combines audit metadata with recommendation/summary data.
 */
export interface ExportInput {
  readonly job: Pick<AuditJob, "url" | "strategy" | "completedAt" | "updatedAt">;
  readonly metrics: AuditMetrics;
  readonly summary: AISummaryResult;
}

/**
 * Display-ready ticket for the markdown report.
 * Maps internal enums to human-readable labels.
 */
export interface DisplayTicket {
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly priorityLabel: string;
  readonly category: string;
  readonly categoryLabel: string;
  readonly metric: string;
  readonly currentValue: string;
  readonly targetValue: string;
  readonly estimatedImpact: string;
  readonly suggestedFix: string;
  readonly evidenceThreshold: string;
  readonly evidenceActual: string;
  readonly evidenceDelta: string;
}

// ---------------------------------------------------------------------------
// Label mappers (pure functions)
// ---------------------------------------------------------------------------

/** Map internal priority code to human-readable label per ADR-015 §1. */
export function mapPriorityLabel(priority: Severity): string {
  const labels: Record<Severity, string> = {
    P0: "Critical",
    P1: "High",
    P2: "Medium",
    P3: "Low",
  };
  return labels[priority];
}

/** Map internal category enum to display label per ADR-015 §1. */
export function mapCategoryLabel(category: IssueCategory): string {
  const labels: Record<IssueCategory, string> = {
    loading: "Loading Performance",
    interactivity: "Interactivity",
    "visual-stability": "Visual Stability",
    server: "Server Response",
    rendering: "Rendering",
  };
  return labels[category];
}

// ---------------------------------------------------------------------------
// Markdown escaping (pure function)
// ---------------------------------------------------------------------------

/**
 * Escape special markdown characters that could break table cells or inline code.
 * Handles pipe (|), backtick (`), and brackets ([]).
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// ---------------------------------------------------------------------------
// Metric rating computation (pure function)
// ---------------------------------------------------------------------------

/** CWV threshold config for rating computation. */
interface RatingThreshold {
  readonly goodBelow: number;
  readonly poorAbove: number;
}

const RATING_THRESHOLDS: Record<string, RatingThreshold> = {
  lcp: { goodBelow: 2500, poorAbove: 4000 },
  cls: { goodBelow: 0.1, poorAbove: 0.25 },
  tbt: { goodBelow: 200, poorAbove: 600 },
  fcp: { goodBelow: 1800, poorAbove: 3000 },
  ttfb: { goodBelow: 800, poorAbove: 1800 },
};

/** Compute a human-readable rating emoji for a metric value. */
export function computeMetricRating(metric: string, value: number | null): string {
  if (value === null) return "N/A";

  const threshold = RATING_THRESHOLDS[metric];
  if (!threshold) return "N/A";

  if (value < threshold.goodBelow) return "\u{1F7E2} Good";
  if (value > threshold.poorAbove) return "\u{1F534} Poor";
  return "\u{1F7E1} Needs Improvement";
}

// ---------------------------------------------------------------------------
// Ticket format mapper (pure functions)
// ---------------------------------------------------------------------------

/** Map severity to estimated impact for fallback (rule-engine-only) tickets. */
function severityToImpact(severity: Severity): string {
  if (severity === "P0" || severity === "P1") return "high";
  if (severity === "P2") return "medium";
  return "low";
}

/** Map a single AITicket to a DisplayTicket. */
function mapAITicketToDisplay(ticket: AITicket, index: number): DisplayTicket {
  return {
    index,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    priorityLabel: mapPriorityLabel(ticket.priority),
    category: ticket.category,
    categoryLabel: mapCategoryLabel(ticket.category),
    metric: ticket.metric,
    currentValue: ticket.currentValue,
    targetValue: ticket.targetValue,
    estimatedImpact: ticket.estimatedImpact,
    suggestedFix: ticket.suggestedFix,
    evidenceThreshold: "N/A",
    evidenceActual: "N/A",
    evidenceDelta: "N/A",
  };
}

/** Map a single RuleEngineOutput to a DisplayTicket (fallback mode). */
function mapRuleOutputToDisplay(output: RuleEngineOutput, index: number): DisplayTicket {
  return {
    index,
    title: `${output.ruleId}: ${output.metric}`,
    description: output.suggestedFix,
    priority: output.severity,
    priorityLabel: mapPriorityLabel(output.severity),
    category: output.category,
    categoryLabel: mapCategoryLabel(output.category),
    metric: output.metric,
    currentValue: formatMetricValue(output.value, output.unit),
    targetValue: getTargetValue(output.metric),
    estimatedImpact: severityToImpact(output.severity),
    suggestedFix: output.suggestedFix,
    evidenceThreshold: String(output.evidence.threshold),
    evidenceActual: String(output.evidence.actual),
    evidenceDelta: output.evidence.delta,
  };
}

/**
 * Map tickets from AISummaryResult to DisplayTicket[].
 * Handles both AI-available (AITicket[]) and fallback (RuleEngineOutput[]) modes.
 */
export function mapTicketsToDisplay(summary: AISummaryResult): DisplayTicket[] {
  if (summary.aiAvailable) {
    return (summary.tickets as AITicket[]).map((ticket, i) => mapAITicketToDisplay(ticket, i + 1));
  }
  return (summary.tickets as RuleEngineOutput[]).map((output, i) =>
    mapRuleOutputToDisplay(output, i + 1)
  );
}

// ---------------------------------------------------------------------------
// Markdown section renderers (pure functions, each < 50 lines)
// ---------------------------------------------------------------------------

/** Render the report header section. */
function renderHeader(job: ExportInput["job"]): string {
  const auditDate = job.completedAt ?? job.updatedAt;
  return [
    "# Web Performance Audit Report",
    "",
    `**URL:** ${escapeMarkdown(job.url)}`,
    `**Audit Date:** ${auditDate}`,
    `**Strategy:** ${job.strategy}`,
    `**Template Version:** ${TEMPLATE_VERSION}`,
    "**Generated by:** NimbleVitals",
    "",
    "---",
  ].join("\n");
}

/** Render the executive summary section. */
function renderExecutiveSummary(summary: AISummaryResult): string {
  const text =
    summary.executiveSummary ??
    "Executive summary unavailable. See prioritized recommendations below.";

  const aiNote = summary.aiAvailable
    ? `AI-enhanced analysis by GPT-4o (${summary.metadata?.modelVersion ?? "unknown"}).`
    : "AI summary temporarily unavailable. Showing rule-engine recommendations.";

  return [
    "## Executive Summary",
    "",
    escapeMarkdown(text),
    "",
    `> **Note:** ${escapeMarkdown(aiNote)}`,
    "",
    "---",
  ].join("\n");
}

/** Format a metric value for the score table. */
function formatScoreTableValue(value: number | null, unit: string): string {
  if (value === null) return "N/A";
  return formatMetricValue(value, unit);
}

/** Render the performance score table section. */
function renderScoreTable(metrics: AuditMetrics): string {
  const score =
    metrics.performanceScore !== null ? `${Math.round(metrics.performanceScore * 100)}/100` : "N/A";

  const rows = [
    `| Largest Contentful Paint (LCP) | ${formatScoreTableValue(metrics.lcp, "ms")} | ${computeMetricRating("lcp", metrics.lcp)} | < 2.5s |`,
    `| Cumulative Layout Shift (CLS) | ${formatScoreTableValue(metrics.cls, "score")} | ${computeMetricRating("cls", metrics.cls)} | < 0.1 |`,
    `| Total Blocking Time (TBT) | ${formatScoreTableValue(metrics.tbt, "ms")} | ${computeMetricRating("tbt", metrics.tbt)} | < 200ms |`,
    `| First Contentful Paint (FCP) | ${formatScoreTableValue(metrics.fcp, "ms")} | ${computeMetricRating("fcp", metrics.fcp)} | < 1.8s |`,
    `| Time to First Byte (TTFB) | ${formatScoreTableValue(metrics.ttfb, "ms")} | ${computeMetricRating("ttfb", metrics.ttfb)} | < 800ms |`,
    `| Speed Index | ${formatScoreTableValue(metrics.si, "ms")} | \u2014 | \u2014 |`,
  ];

  return [
    "## Performance Score",
    "",
    `**Overall Score:** ${score}`,
    "",
    "| Metric | Value | Rating | Threshold |",
    "|--------|-------|--------|-----------|",
    ...rows,
    "",
    "---",
  ].join("\n");
}

/** Render a single recommendation card. */
function renderRecommendation(ticket: DisplayTicket): string {
  return [
    `### ${ticket.index}. [${ticket.priorityLabel}] ${escapeMarkdown(ticket.title)}`,
    "",
    `**Category:** ${ticket.categoryLabel}`,
    `**Metric:** ${ticket.metric} \u2014 ${escapeMarkdown(ticket.currentValue)} (target: ${escapeMarkdown(ticket.targetValue)})`,
    `**Impact:** ${ticket.estimatedImpact}`,
    "",
    escapeMarkdown(ticket.description),
    "",
    "#### Implementation Steps",
    "",
    escapeMarkdown(ticket.suggestedFix),
    "",
    "#### Evidence",
    "",
    "| Measure | Value |",
    "|---------|-------|",
    `| Threshold | ${escapeMarkdown(ticket.evidenceThreshold)} |`,
    `| Actual | ${escapeMarkdown(ticket.evidenceActual)} |`,
    `| Delta | ${escapeMarkdown(ticket.evidenceDelta)} |`,
    "",
    "---",
  ].join("\n");
}

/** Render the prioritized recommendations section. */
function renderRecommendations(tickets: DisplayTicket[]): string {
  if (tickets.length === 0) {
    return [
      "## Prioritized Recommendations",
      "",
      "\u{1F389} **Congratulations!** No performance issues were found. Your site meets all Core Web Vitals thresholds.",
      "",
      "---",
    ].join("\n");
  }

  return ["## Prioritized Recommendations", "", ...tickets.map(renderRecommendation)].join("\n");
}

/** Render the developer ticket backlog table section. */
function renderTicketBacklog(tickets: DisplayTicket[]): string {
  if (tickets.length === 0) {
    return [
      "## Developer Ticket Backlog",
      "",
      "No tickets to display. All metrics are within acceptable thresholds.",
      "",
      "---",
    ].join("\n");
  }

  const rows = tickets.map(
    (t) =>
      `| ${t.index} | ${t.priorityLabel} | ${escapeMarkdown(t.title)} | ${t.categoryLabel} | ${t.metric} | ${escapeMarkdown(t.currentValue)} | ${escapeMarkdown(t.targetValue)} | ${t.estimatedImpact} |`
  );

  return [
    "## Developer Ticket Backlog",
    "",
    "The following tickets are ready for import into your project management tool.",
    "",
    "| # | Priority | Title | Category | Metric | Current | Target | Impact |",
    "|---|----------|-------|----------|--------|---------|--------|--------|",
    ...rows,
    "",
    "---",
  ].join("\n");
}

/** Render the methodology section. */
function renderMethodology(job: ExportInput["job"], summary: AISummaryResult): string {
  const aiNote = summary.aiAvailable
    ? `Enhanced by AI (model: ${summary.metadata?.modelVersion ?? "unknown"}, prompt: ${summary.metadata?.promptHash ?? "unknown"}).`
    : "Rule-engine analysis only (AI unavailable).";

  return [
    "## Methodology",
    "",
    "- **Data source:** Google PageSpeed Insights API v5 (Lighthouse)",
    `- **Strategy:** ${job.strategy}`,
    "- **Lighthouse version:** See audit metadata",
    "- **Thresholds:** Based on [web.dev Core Web Vitals](https://web.dev/vitals/) standards",
    "- **Recommendations:** Generated by deterministic rule engine (source of truth)",
    `- **Executive summary:** ${escapeMarkdown(aiNote)}`,
    "",
    "---",
  ].join("\n");
}

/** Render the report footer. */
function renderFooter(): string {
  return [
    "*Report generated by [NimbleVitals](https://nimblevitals.app) \u2014 Turn audits into engineering tickets in minutes.*",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main export function (pure, composes all sections)
// ---------------------------------------------------------------------------

/**
 * Render a complete markdown export report per ADR-015 template v1.
 *
 * Pure function: (ExportInput) -> string. No side effects, no I/O.
 * Handles AI-available and fallback modes, empty recommendations,
 * and special character escaping.
 *
 * 7 sections: header, executive summary, score table, recommendations,
 * ticket backlog, methodology, footer.
 */
export function renderExportMarkdown(input: ExportInput): string {
  const tickets = mapTicketsToDisplay(input.summary);

  const sections = [
    renderHeader(input.job),
    renderExecutiveSummary(input.summary),
    renderScoreTable(input.metrics),
    renderRecommendations(tickets),
    renderTicketBacklog(tickets),
    renderMethodology(input.job, input.summary),
    renderFooter(),
  ];

  return sections.join("\n\n");
}
