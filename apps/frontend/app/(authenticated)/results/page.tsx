"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MotionWrapper } from "@/components/MotionWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import {
  getRecommendations,
  getSummary,
  sortBySeverity,
  sortByPriority,
  getSeverityBadgeVariant,
  COPY_RESULTS_LOAD_FAILED,
  COPY_AI_UNAVAILABLE,
  COPY_AUDIT_NOT_FOUND,
  COPY_AUDIT_NOT_COMPLETED,
  COPY_RESULTS_EMPTY,
  COPY_AUDIT_FORBIDDEN,
  type Recommendation,
  type SummaryResponse,
} from "@/lib/results";

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states + special states)        */
/* ------------------------------------------------------------------ */

type PageState =
  | "loading"
  | "success"
  | "empty"
  | "error"
  | "not-found"
  | "not-completed"
  | "forbidden";

/* ------------------------------------------------------------------ */
/* ResultsPage component                                               */
/* ------------------------------------------------------------------ */

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auditId = searchParams.get("id");

  /* --- Page-level state --- */
  const [pageState, setPageState] = useState<PageState>("loading");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* --- Refs --- */
  const errorRef = useRef<HTMLDivElement>(null);

  /* --- Fetch data --- */
  const fetchResults = useCallback(async () => {
    if (auditId === null || auditId === "") {
      setPageState("not-found");
      return;
    }

    setPageState("loading");
    setError(null);

    try {
      const [recsResult, summaryResult] = await Promise.all([
        getRecommendations(auditId),
        getSummary(auditId),
      ]);

      const sorted = sortBySeverity(recsResult.recommendations);
      setRecommendations(sorted);
      setSummary(summaryResult);

      if (sorted.length === 0 && summaryResult.tickets.length === 0) {
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
  }, [auditId, router]);

  /* --- Initial load --- */
  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

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

  return (
    <MotionWrapper>
      <main data-testid="results-page" className="min-h-screen p-8 bg-neutral-950 text-neutral-50">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold mb-6">Results</h1>

          {/* Loading state — skeleton cards */}
          {pageState === "loading" && (
            <div data-testid="results-loading" role="status" aria-label="Loading results">
              {/* Summary skeleton */}
              <div className="mb-8">
                <Skeleton width="40%" height="28px" variant="text" className="mb-4" />
                <Skeleton width="100%" height="16px" variant="text" className="mb-2" />
                <Skeleton width="90%" height="16px" variant="text" className="mb-2" />
                <Skeleton width="70%" height="16px" variant="text" />
              </div>
              {/* Recommendation card skeletons */}
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Skeleton width="48px" height="22px" variant="text" />
                      <Skeleton width="60%" height="20px" variant="text" />
                    </div>
                    <Skeleton width="80%" height="16px" variant="text" className="mb-2" />
                    <Skeleton width="50%" height="16px" variant="text" />
                  </div>
                ))}
              </div>
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

          {/* Success state — summary + recommendations */}
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

              {/* Executive summary section */}
              {executiveSummary !== null && executiveSummary !== "" && (
                <section data-testid="executive-summary" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-200">Executive Summary</h2>
                  <div className="prose prose-invert max-w-none">
                    {executiveSummary.split("\n\n").map((paragraph, idx) => (
                      <p key={idx} className="text-neutral-300 text-sm leading-relaxed mb-3">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {/* Dev ticket backlog */}
              {summary !== null && summary.tickets.length > 0 && (
                <section data-testid="dev-tickets" className="mb-8">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-200">
                    Dev Ticket Backlog
                  </h2>
                  <div className="space-y-3">
                    {sortByPriority(summary.tickets).map((ticket, idx) => (
                      <Card key={idx} data-testid={`dev-ticket-${idx}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <Badge
                            label={ticket.priority}
                            variant={getSeverityBadgeVariant(ticket.priority)}
                          />
                          <h3 className="text-sm font-semibold text-neutral-50">{ticket.title}</h3>
                        </div>
                        <p className="text-xs text-neutral-400 mb-2">{ticket.description}</p>
                        <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
                          <span>Metric: {ticket.metric}</span>
                          <span>Current: {ticket.currentValue}</span>
                          <span>Target: {ticket.targetValue}</span>
                        </div>
                        {ticket.estimatedImpact !== "" && (
                          <p className="text-xs text-blue-400 mt-2">
                            Impact: {ticket.estimatedImpact}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {/* Recommendations section */}
              {recommendations.length > 0 && (
                <section data-testid="recommendations" aria-label="Recommendations">
                  <h2 className="text-xl font-semibold mb-4 text-neutral-200">Recommendations</h2>
                  <div className="space-y-3" role="list">
                    {recommendations.map((rec, idx) => (
                      <Card
                        key={rec.ruleId}
                        data-testid={`recommendation-${idx}`}
                        aria-label={`${rec.severity} recommendation: ${rec.metric}`}
                      >
                        <div role="listitem">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge
                              label={rec.severity}
                              variant={getSeverityBadgeVariant(rec.severity)}
                            />
                            <span className="text-sm font-medium text-neutral-200">
                              {rec.metric}
                            </span>
                            <span className="text-xs text-neutral-500">({rec.category})</span>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-neutral-500 mb-2">
                            <span>Current: {rec.currentValue}</span>
                            <span>Target: {rec.targetValue}</span>
                          </div>
                          <p className="text-sm text-neutral-300 mb-2">{rec.suggestedFix}</p>
                          {rec.evidence !== "" && (
                            <p className="text-xs text-neutral-500 italic">{rec.evidence}</p>
                          )}
                        </div>
                      </Card>
                    ))}
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
