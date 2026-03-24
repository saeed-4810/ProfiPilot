"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MotionWrapper } from "@/components/MotionWrapper";
import { trackPageView, trackResultsView } from "@/lib/analytics";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { MetricCardSkeleton } from "@/components/ui/MetricCardSkeleton";
import { ResultsListSkeleton } from "@/components/ui/ResultsListSkeleton";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import { getAuditStatus, type AuditMetrics } from "@/lib/audit";
import { listProjects, getProject, getLatestAuditForUrl, type UrlAuditInfo } from "@/lib/projects";
import { SourceRef } from "@/components/ui/SourceRef";
import {
  getRecommendations,
  getSummary,
  sortBySeverity,
  sortByPriority,
  getSeverityBadgeVariant,
  formatEvidence,
  normalizeTicket,
  extractMetrics,
  extractMetricsFromAudit,
  parseSourceRefs,
  buildMetricLookup,
  COPY_RESULTS_LOAD_FAILED,
  COPY_AI_UNAVAILABLE,
  COPY_AUDIT_NOT_FOUND,
  COPY_AUDIT_NOT_COMPLETED,
  COPY_RESULTS_EMPTY,
  COPY_AUDIT_FORBIDDEN,
  type Recommendation,
  type SummaryResponse,
  type Severity,
  type NormalizedTicket,
} from "@/lib/results";

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states + special states)        */
/* ------------------------------------------------------------------ */

type PageState =
  | "loading"
  | "browse"
  | "success"
  | "empty"
  | "error"
  | "not-found"
  | "not-completed"
  | "forbidden";

/* ------------------------------------------------------------------ */
/* Severity → icon badge variant mapping for PERF-143                  */
/* ------------------------------------------------------------------ */

type SeverityIconBadgeVariant = "severity-error" | "severity-warning" | "severity-good";

const SEVERITY_ICON_BADGE: Record<Severity, SeverityIconBadgeVariant> = {
  P0: "severity-error",
  P1: "severity-warning",
  P2: "severity-good",
  P3: "severity-good",
};

/* ------------------------------------------------------------------ */
/* Severity → left border color for Jira-style ticket cards            */
/* ------------------------------------------------------------------ */

const SEVERITY_BORDER_COLOR: Record<Severity, string> = {
  P0: "border-l-red-500",
  P1: "border-l-yellow-500",
  P2: "border-l-blue-500",
  P3: "border-l-neutral-500",
};

/* ------------------------------------------------------------------ */
/* Severity → top accent color for recommendation insight cards        */
/* ------------------------------------------------------------------ */

const SEVERITY_TOP_ACCENT: Record<Severity, string> = {
  P0: "border-t-red-500",
  P1: "border-t-yellow-500",
  P2: "border-t-blue-500",
  P3: "border-t-neutral-500",
};

/* ------------------------------------------------------------------ */
/* Severity → impact text color                                        */
/* ------------------------------------------------------------------ */

const SEVERITY_IMPACT_COLOR: Record<Severity, string> = {
  P0: "text-red-400",
  P1: "text-yellow-400",
  P2: "text-blue-400",
  P3: "text-neutral-400",
};

/* ------------------------------------------------------------------ */
/* Severity → current value pill color for recommendations             */
/* ------------------------------------------------------------------ */

const SEVERITY_PILL_COLOR: Record<Severity, string> = {
  P0: "bg-red-500/10 text-red-400 border-red-500/20",
  P1: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  P2: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  P3: "bg-neutral-800 text-neutral-300 border-neutral-700",
};

/* ------------------------------------------------------------------ */
/* Copy ticket as markdown — clipboard helper                          */
/* ------------------------------------------------------------------ */

/** Format a NormalizedTicket as a markdown string. */
function formatTicketAsMarkdown(ticket: NormalizedTicket): string {
  const lines = [
    `## [${ticket.priority}] ${ticket.title}`,
    "",
    ticket.description,
    "",
    `- **Metric:** ${ticket.metric}`,
    `- **Current:** ${ticket.currentValue}`,
    `- **Target:** ${ticket.targetValue}`,
    "",
    `### Suggested Fix`,
    ticket.suggestedFix,
  ];

  if (ticket.estimatedImpact !== "") {
    lines.push("", `**Impact:** ${ticket.estimatedImpact}`);
  }

  return lines.join("\n");
}

/** Copy a ticket as markdown to the clipboard. */
function copyTicketAsMarkdown(ticket: NormalizedTicket): void {
  const markdown = formatTicketAsMarkdown(ticket);
  /* v8 ignore next 2 -- clipboard API unavailable in jsdom test environment */
  if (typeof navigator?.clipboard?.writeText === "function") {
    void navigator.clipboard.writeText(markdown);
  }
}

/* ------------------------------------------------------------------ */
/* Chevron icon for expandable recommendations                         */
/* ------------------------------------------------------------------ */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="chevron-icon"
      className={`text-neutral-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ResultsPage component                                               */
/* ------------------------------------------------------------------ */

/** A URL with completed audit data for the browse list. */
interface AuditedUrl {
  url: string;
  projectName: string;
  auditId: string;
}

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auditId = searchParams.get("id");

  /* --- Page-level state --- */
  const [pageState, setPageState] = useState<PageState>("loading");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [normalizedTickets, setNormalizedTickets] = useState<NormalizedTicket[]>([]);
  const [auditMetrics, setAuditMetrics] = useState<AuditMetrics | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecs, setExpandedRecs] = useState<Set<number>>(new Set());

  /* --- Browse state: list of audited URLs when no ?id= param --- */
  const [auditedUrls, setAuditedUrls] = useState<AuditedUrl[]>([]);

  /* --- Refs --- */
  const errorRef = useRef<HTMLDivElement>(null);

  /* --- Toggle recommendation expand/collapse --- */
  const toggleRec = useCallback((idx: number) => {
    setExpandedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  /* --- Fetch browse list (all audited URLs across projects) --- */
  const fetchBrowseList = useCallback(async () => {
    setPageState("loading");
    try {
      const projectList = await listProjects();
      if (projectList.items.length === 0) {
        setAuditedUrls([]);
        setPageState("browse");
        return;
      }

      // For each project, get URLs and check for completed audits
      const allAudited: AuditedUrl[] = [];
      const projectDetails = await Promise.all(
        projectList.items.map(async (p) => {
          const detail = await getProject(p.projectId);
          return { name: p.name, urls: detail.urls };
        })
      );

      const auditChecks = projectDetails.flatMap((proj) =>
        proj.urls.map(async (u) => {
          const info: UrlAuditInfo = await getLatestAuditForUrl(u.url);
          if (info.hasAuditData && info.auditId !== null) {
            allAudited.push({ url: u.url, projectName: proj.name, auditId: info.auditId });
          }
        })
      );
      await Promise.all(auditChecks);

      setAuditedUrls(allAudited);
      setPageState("browse");
      /* v8 ignore next 4 -- defensive: browse list fetch failure falls back to empty state */
    } catch {
      setAuditedUrls([]);
      setPageState("browse");
    }
  }, []);

  /* --- Fetch data --- */
  const fetchResults = useCallback(async () => {
    if (auditId === null || auditId === "") {
      void fetchBrowseList();
      return;
    }

    setPageState("loading");
    setError(null);

    try {
      const [recsResult, summaryResult, statusResult] = await Promise.all([
        getRecommendations(auditId),
        getSummary(auditId),
        getAuditStatus(auditId),
      ]);

      const sorted = sortBySeverity(recsResult.recommendations);
      setRecommendations(sorted);
      setSummary(summaryResult);
      setAuditMetrics(statusResult.metrics);

      const tickets = summaryResult.tickets.map(normalizeTicket);
      setNormalizedTickets(sortByPriority(tickets));

      // Always show success if we have metrics (even with zero recommendations)
      if (statusResult.metrics !== undefined) {
        setPageState("success");
      } else if (sorted.length === 0 && summaryResult.tickets.length === 0) {
        setPageState("empty");
      } else {
        setPageState("success");
      }
    } catch (err: unknown) {
      const typedErr = err as Error & { status?: number; code?: string };

      if (typedErr.status === 401) {
        router.push("/login");
        return;
      }

      if (typedErr.status === 403) {
        setPageState("forbidden");
        return;
      }

      if (typedErr.status === 404) {
        setPageState("not-found");
        return;
      }

      if (typedErr.status === 400 && typedErr.code === "AUDIT_NOT_COMPLETED") {
        setPageState("not-completed");
        return;
      }

      setError(typedErr.message || COPY_RESULTS_LOAD_FAILED);
      setPageState("error");
      /* v8 ignore next -- errorRef may be null in test environment */
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [auditId, fetchBrowseList, router]);

  /* --- Initial load --- */
  useEffect(() => {
    trackPageView({ route: "/results", timestamp: Date.now() });
    if (auditId !== null && auditId !== "") {
      trackResultsView({ audit_id: auditId, timestamp: Date.now() });
    }
    void fetchResults();
  }, [fetchResults, auditId]);

  /* --- Retry handler --- */
  const handleRetry = useCallback(() => {
    void fetchResults();
  }, [fetchResults]);

  /* --- Navigate back to dashboard --- */
  const handleBackToDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  /* --- AI availability --- */
  const aiAvailable = summary?.aiAvailable === true;
  const executiveSummary = summary?.executiveSummary ?? null;

  /* --- Metric lookup for source references (PERF-148) --- */
  const metricLookup = buildMetricLookup(recommendations);

  /* --- Derived metric cards for PERF-143 --- */
  // Primary: build from raw audit metrics (always available when completed)
  // Fallback: build from recommendations (when metrics are unavailable)
  const metricCards =
    auditMetrics !== undefined
      ? extractMetricsFromAudit(auditMetrics)
      : extractMetrics(recommendations);

  return (
    <MotionWrapper>
      <main data-testid="results-page" className="min-h-screen p-8 bg-neutral-950 text-neutral-50">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold mb-6">Results</h1>

          {/* Loading state — contextual skeleton cards (PERF-160) */}
          {pageState === "loading" && (
            <div data-testid="results-loading" role="status" aria-label="Loading results">
              {/* CWV metric card skeletons — matches MetricCard shape */}
              <section className="mb-8">
                <Skeleton width="160px" height="24px" variant="text" className="mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[0, 1, 2, 3].map((i) => (
                    <MetricCardSkeleton key={i} />
                  ))}
                </div>
              </section>

              {/* Executive summary skeleton */}
              <section className="mb-8">
                <Skeleton width="200px" height="24px" variant="text" className="mb-4" />
                <Skeleton width="100%" height="16px" variant="text" className="mb-2" />
                <Skeleton width="90%" height="16px" variant="text" className="mb-2" />
                <Skeleton width="70%" height="16px" variant="text" />
              </section>

              {/* Recommendation list skeleton — matches recommendation card shape */}
              <section>
                <Skeleton width="180px" height="24px" variant="text" className="mb-4" />
                <ResultsListSkeleton count={3} />
              </section>
            </div>
          )}

          {/* Error state — accessible alert with retry */}
          {pageState === "error" && error !== null && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              data-testid="results-error"
              className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-500 text-red-200"
            >
              <p className="text-sm mb-3">{error}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                data-testid="results-retry"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Browse state — no ?id= param, show all audited URLs */}
          {pageState === "browse" && (
            <div data-testid="results-browse">
              {auditedUrls.length === 0 ? (
                <div data-testid="results-browse-empty" className="text-center py-16">
                  <h2 className="text-xl font-semibold mb-2 text-neutral-200">
                    No audit results yet
                  </h2>
                  <p className="text-neutral-400 mb-4">
                    Run an audit from the dashboard to see results here.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBackToDashboard}
                    data-testid="results-browse-to-dashboard"
                  >
                    Go to Dashboard
                  </Button>
                </div>
              ) : (
                <div data-testid="results-browse-list">
                  <h2 className="text-lg font-semibold mb-4 text-neutral-200">
                    Select an audit to view
                  </h2>
                  <div className="space-y-2">
                    {auditedUrls.map((item) => (
                      <button
                        key={item.auditId}
                        type="button"
                        onClick={() => {
                          router.push(`/results?id=${encodeURIComponent(item.auditId)}`);
                        }}
                        data-testid={`browse-audit-${item.auditId}`}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-800/50 bg-neutral-900/80 px-4 py-3 text-left transition-all hover:border-neutral-700/50 hover:bg-neutral-800/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-200 truncate">
                            {item.url}
                          </p>
                          <p className="text-xs text-neutral-500">{item.projectName}</p>
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500">View →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Forbidden state — 403 AUDIT_FORBIDDEN */}
          {pageState === "forbidden" && (
            <div data-testid="results-forbidden" className="text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-neutral-200">
                {COPY_AUDIT_FORBIDDEN}
              </h2>
              <p className="text-neutral-400 mb-4">You can only view results for audits you own.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBackToDashboard}
                data-testid="results-back-dashboard"
              >
                Back to Dashboard
              </Button>
            </div>
          )}

          {/* Not found state */}
          {pageState === "not-found" && (
            <div data-testid="results-not-found" className="text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-neutral-200">
                {COPY_AUDIT_NOT_FOUND}
              </h2>
              <p className="text-neutral-400 mb-4">
                The audit you are looking for does not exist or has been removed.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBackToDashboard}
                data-testid="results-back-dashboard-notfound"
              >
                Back to Dashboard
              </Button>
            </div>
          )}

          {/* Not completed state */}
          {pageState === "not-completed" && (
            <div data-testid="results-not-completed" className="text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-neutral-200">
                {COPY_AUDIT_NOT_COMPLETED}
              </h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                data-testid="results-retry-processing"
                className="mt-4"
              >
                Check Again
              </Button>
            </div>
          )}

          {/* Empty state — all metrics good */}
          {pageState === "empty" && (
            <div data-testid="results-empty" className="text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-green-400">{COPY_RESULTS_EMPTY}</h2>
              <p className="text-neutral-400">All Core Web Vitals are within target thresholds.</p>
            </div>
          )}

          {/* Success state — metrics overview + summary + recommendations */}
          {pageState === "success" && (
            <div data-testid="results-content">
              {/* AI unavailable banner */}
              {!aiAvailable && (
                <div
                  data-testid="ai-unavailable-banner"
                  role="status"
                  className="mb-6 p-4 rounded-lg bg-yellow-900/30 border border-yellow-700 text-yellow-300"
                >
                  <p className="text-sm font-medium">{COPY_AI_UNAVAILABLE}</p>
                  {summary?.fallbackReason !== undefined && summary.fallbackReason !== "" && (
                    <p className="text-xs text-yellow-400 mt-1">{summary.fallbackReason}</p>
                  )}
                </div>
              )}

              {/* CWV Metrics Overview — PERF-143 */}
              {metricCards.length > 0 && (
                <section data-testid="metrics-overview" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-50">Core Web Vitals</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {metricCards.map((card) => (
                      <MetricCard key={card.label} {...card} />
                    ))}
                  </div>
                </section>
              )}

              {/* Executive summary section — with inline source refs (PERF-148) */}
              {executiveSummary !== null && executiveSummary !== "" && (
                <section data-testid="executive-summary" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-200">Executive Summary</h2>
                  <div className="prose prose-invert max-w-none">
                    {executiveSummary.split("\n\n").map((paragraph, pIdx) => (
                      <p key={pIdx} className="text-neutral-300 text-sm leading-relaxed mb-3">
                        {parseSourceRefs(paragraph, metricLookup).map((segment, sIdx) =>
                          typeof segment === "string" ? (
                            <span key={sIdx}>{segment}</span>
                          ) : (
                            <SourceRef key={sIdx} {...segment} />
                          )
                        )}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {/* Dev ticket backlog — Jira-style ticket cards */}
              {normalizedTickets.length > 0 && (
                <section data-testid="dev-tickets" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-200">
                    Dev Ticket Backlog
                  </h2>
                  <div className="space-y-3">
                    {normalizedTickets.map((ticket, idx) => (
                      <Card
                        key={idx}
                        data-testid={`dev-ticket-${idx}`}
                        className={`border-l-4 ${SEVERITY_BORDER_COLOR[ticket.priority]}`}
                      >
                        {/* Header: priority badge + title */}
                        <div className="flex items-center gap-3 mb-3">
                          <Badge
                            label={ticket.priority}
                            variant={getSeverityBadgeVariant(ticket.priority)}
                          />
                          <h3 className="text-base font-semibold text-neutral-50">
                            {ticket.title}
                          </h3>
                        </div>

                        {/* Description — 2-line clamp */}
                        <p className="text-sm text-neutral-400 mb-3 line-clamp-2">
                          {ticket.description}
                        </p>

                        {/* Metric info pills */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="inline-flex items-center gap-1 bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-xs">
                            📊 {ticket.metric}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-xs">
                            📍 {ticket.currentValue}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-xs">
                            🎯 Target: {ticket.targetValue}
                          </span>
                        </div>

                        {/* Suggested fix box */}
                        {ticket.suggestedFix !== "" && (
                          <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700/50 mb-3">
                            <p className="text-sm text-neutral-300">
                              <span className="mr-1.5">💡</span>
                              <span className="font-medium text-neutral-200">Suggested Fix</span>
                            </p>
                            <p className="text-sm text-neutral-400 mt-1">{ticket.suggestedFix}</p>
                          </div>
                        )}

                        {/* Impact line + copy button row */}
                        <div className="flex items-center justify-between">
                          {ticket.estimatedImpact !== "" && (
                            <p
                              className={`text-xs ${SEVERITY_IMPACT_COLOR[ticket.priority]} flex items-center gap-1`}
                            >
                              <span aria-hidden="true">⚡</span>
                              <span>Impact: {ticket.estimatedImpact}</span>
                            </p>
                          )}
                          <button
                            type="button"
                            data-testid={`ticket-copy-btn-${idx}`}
                            className="ml-auto inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors px-2 py-1 rounded hover:bg-neutral-800"
                            onClick={() => {
                              copyTicketAsMarkdown(ticket);
                            }}
                          >
                            📋 Copy
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {/* Recommendations section — expandable insight cards (PERF-143) */}
              {recommendations.length > 0 && (
                <section data-testid="recommendations" aria-label="Recommendations">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-200">Recommendations</h2>
                  <div className="space-y-3" role="list">
                    {recommendations.map((rec, idx) => {
                      const isExpanded = expandedRecs.has(idx);
                      return (
                        <Card
                          key={rec.ruleId}
                          data-testid={`recommendation-${idx}`}
                          aria-label={`${rec.severity} recommendation: ${rec.metric}`}
                          className={`border-t-2 ${SEVERITY_TOP_ACCENT[rec.severity]} pt-5`}
                        >
                          <div role="listitem">
                            {/* Collapsed header: badge + metric + category tag + chevron */}
                            <button
                              type="button"
                              className="flex items-center gap-3 w-full text-left"
                              aria-expanded={isExpanded}
                              data-testid={`recommendation-toggle-${idx}`}
                              onClick={() => {
                                toggleRec(idx);
                              }}
                            >
                              <Badge
                                label={rec.severity}
                                variant={SEVERITY_ICON_BADGE[rec.severity]}
                              />
                              <span className="text-sm font-medium text-neutral-200 flex-1">
                                {rec.metric}
                              </span>
                              <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">
                                {rec.category}
                              </span>
                              <ChevronIcon expanded={isExpanded} />
                            </button>

                            {/* Expandable detail — insight card content */}
                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  key={`rec-detail-${idx}`}
                                  data-testid={`recommendation-detail-${idx}`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="pt-4">
                                    {/* Current → Target pills */}
                                    <div className="flex items-center gap-2 mb-3">
                                      <span
                                        className={`inline-flex items-center border px-2.5 py-0.5 rounded text-xs font-medium ${SEVERITY_PILL_COLOR[rec.severity]}`}
                                      >
                                        Current: {rec.currentValue}
                                      </span>
                                      <span className="text-neutral-500 text-xs" aria-hidden="true">
                                        →
                                      </span>
                                      <span className="inline-flex items-center border px-2.5 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border-green-500/20">
                                        Target: {rec.targetValue}
                                      </span>
                                    </div>

                                    {/* Divider */}
                                    <div className="border-t border-neutral-800 mb-3" />

                                    {/* How to fix */}
                                    <div className="mb-3">
                                      <p className="text-xs font-medium text-neutral-400 mb-1 flex items-center gap-1.5">
                                        <span aria-hidden="true">🔧</span> How to fix
                                      </p>
                                      <p className="text-sm text-neutral-300">{rec.suggestedFix}</p>
                                    </div>

                                    {/* Evidence */}
                                    {rec.evidence && (
                                      <div>
                                        <p className="text-xs font-medium text-neutral-400 mb-1 flex items-center gap-1.5">
                                          <span aria-hidden="true">📊</span> Evidence
                                        </p>
                                        <p className="text-xs text-neutral-500 italic font-mono">
                                          {formatEvidence(rec.evidence)}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}
