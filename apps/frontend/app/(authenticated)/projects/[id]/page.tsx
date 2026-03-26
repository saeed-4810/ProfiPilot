"use client";

/**
 * Project Overview page — Stitch bento grid layout (PERF-167).
 *
 * Route: /projects/[id]
 * Opens when users click "Review details" on a dashboard project card.
 *
 * Layout: 4 bento sections in a responsive grid:
 *   1. Overall Project Health (score card)
 *   2. 30-Day Performance Trends (SVG chart)
 *   3. Audit Log (timeline)
 *   4. Endpoint Registry (table)
 *
 * Data from 3 backend APIs (PERF-166, ADR-029):
 *   GET /api/v1/projects/:id/health
 *   GET /api/v1/projects/:id/audits
 *   GET /api/v1/projects/:id/trends
 *
 * AC1-AC16: See PERF-167 acceptance criteria.
 * AC15: trackPageView on mount with route /projects/{id}.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MotionWrapper } from "@/components/MotionWrapper";
import { trackPageView } from "@/lib/analytics";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TrendChart } from "@/components/ui/TrendChart";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import {
  getProjectHealth,
  getProjectAudits,
  getProjectTrends,
  classifyScore,
  formatDelta,
  COPY_PROJECT_DETAIL_ERROR,
  COPY_HEALTH_HEADING,
  COPY_TRENDS_HEADING,
  COPY_AUDIT_LOG_HEADING,
  COPY_ENDPOINT_HEADING,
  COPY_START_AUDIT,
  COPY_VIEW_REPORT,
  COPY_RUN_AUDIT,
  COPY_NO_AUDITS,
  COPY_NO_URLS,
  type ProjectHealthResponse,
  type ProjectAuditsResponse,
  type ProjectTrendsResponse,
} from "@/lib/project-detail";
import { getProject } from "@/lib/projects";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type PageState = "loading" | "error" | "success";

/* ------------------------------------------------------------------ */
/* Score badge variant helper                                          */
/* ------------------------------------------------------------------ */

const SCORE_BADGE_VARIANT: Record<string, "success" | "warning" | "error" | "neutral"> = {
  success: "success",
  warning: "warning",
  error: "error",
  neutral: "neutral",
};

function scoreToBadgeVariant(score: number | null): "success" | "warning" | "error" | "neutral" {
  /* v8 ignore next -- fallback unreachable: classifyScore always returns a valid key */
  return SCORE_BADGE_VARIANT[classifyScore(score)] ?? "neutral";
}

/* ------------------------------------------------------------------ */
/* Delta arrow component                                               */
/* ------------------------------------------------------------------ */

function DeltaArrow({ direction }: { readonly direction: "up" | "down" | "neutral" }) {
  if (direction === "up") {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#4ae176"
        strokeWidth={3}
        aria-hidden="true"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ff6b6b"
        strokeWidth={3}
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */

function ProjectOverviewSkeleton() {
  return (
    <div data-testid="project-overview-loading" className="space-y-6">
      {/* Breadcrumb skeleton */}
      <Skeleton variant="text" width="200px" height="16px" />
      {/* Bento grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4" data-testid="skeleton-health">
          <Skeleton variant="rectangular" width="100%" height="220px" />
        </div>
        <div className="md:col-span-8" data-testid="skeleton-trends">
          <Skeleton variant="rectangular" width="100%" height="220px" />
        </div>
        <div className="md:col-span-6" data-testid="skeleton-audit-log">
          <Skeleton variant="rectangular" width="100%" height="280px" />
        </div>
        <div className="md:col-span-6" data-testid="skeleton-endpoint">
          <Skeleton variant="rectangular" width="100%" height="280px" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error state                                                         */
/* ------------------------------------------------------------------ */

function ProjectOverviewError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div
      data-testid="project-overview-error"
      className="flex flex-col items-center justify-center gap-4 py-16"
    >
      <p className="text-sm text-neutral-400">
        {/* copy: project-overview-error */}
        {COPY_PROJECT_DETAIL_ERROR}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bento section wrapper                                               */
/* ------------------------------------------------------------------ */

function BentoSection({
  title,
  children,
  className = "",
  testId,
  action,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly testId: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-xl border border-neutral-800 bg-neutral-900 p-5 ${className}`.trim()}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
          {title}
        </h3>
        {/* v8 ignore next -- action prop unused in MVP, reserved for future section actions */}
        {action !== undefined && action}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Health card content                                                  */
/* ------------------------------------------------------------------ */

function HealthCardContent({ health }: { readonly health: ProjectHealthResponse }) {
  const delta = formatDelta(health.scoreDelta);

  return (
    <div data-testid="health-card-content">
      {health.overallScore !== null ? (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-7xl font-light text-neutral-50" data-testid="health-score">
              {Math.round(health.overallScore)}
            </span>
            <span className="text-lg text-neutral-500">/100</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <DeltaArrow direction={delta.direction} />
            <span
              data-testid="health-delta"
              className={`text-sm ${
                delta.direction === "up"
                  ? "text-green-400"
                  : delta.direction === "down"
                    ? "text-red-400"
                    : "text-neutral-500"
              }`}
            >
              {delta.text}{" "}
              {health.deltaLabel !== "" && health.deltaLabel !== delta.text
                ? health.deltaLabel
                : ""}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-400" data-testid="health-no-data">
          {/* copy: project-overview-no-audits */}
          {COPY_NO_AUDITS}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit log content                                                   */
/* ------------------------------------------------------------------ */

function AuditLogContent({ audits }: { readonly audits: ProjectAuditsResponse }) {
  const router = useRouter();

  if (audits.items.length === 0) {
    return (
      <p className="text-sm text-neutral-400" data-testid="audit-log-empty">
        {/* copy: project-overview-no-audits */}
        {COPY_NO_AUDITS}
      </p>
    );
  }

  return (
    <div className="space-y-0" data-testid="audit-log-timeline">
      {audits.items.map((audit, index) => {
        const variant = scoreToBadgeVariant(audit.performanceScore);
        const isLast = index === audits.items.length - 1;

        return (
          <div key={audit.jobId} className="group relative flex gap-3 pb-4">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center">
              <div
                className={`h-3 w-3 rounded-full border-2 ${
                  variant === "success"
                    ? "border-green-400 bg-green-400/20"
                    : variant === "warning"
                      ? "border-yellow-400 bg-yellow-400/20"
                      : variant === "error"
                        ? "border-red-400 bg-red-400/20"
                        : "border-neutral-500 bg-neutral-500/20"
                }`}
              />
              {!isLast && <div className="w-px flex-1 bg-neutral-700" />}
            </div>

            {/* Content */}
            <div className="flex-1 -mt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-200">
                  Audit-{audit.jobId.slice(0, 4)}
                </span>
                {audit.performanceScore !== null && (
                  <Badge label={String(Math.round(audit.performanceScore))} variant={variant} />
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {new Date(audit.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {/* AC12: View Report link */}
              <button
                data-testid="audit-view-report"
                className="mt-1 text-xs text-[#adc6ff] opacity-0 group-hover:opacity-100 transition-opacity motion-reduce:opacity-100 motion-reduce:transition-none cursor-pointer bg-transparent border-none p-0"
                onClick={() => {
                  router.push(`/results?id=${audit.jobId}`);
                }}
              >
                {/* copy: project-overview-view-report */}
                {COPY_VIEW_REPORT}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Endpoint registry content                                           */
/* ------------------------------------------------------------------ */

function EndpointRegistryContent({ health }: { readonly health: ProjectHealthResponse }) {
  const router = useRouter();

  if (health.urlScores.length === 0) {
    return (
      <p className="text-sm text-neutral-400" data-testid="endpoint-empty">
        {/* copy: project-overview-no-urls */}
        {COPY_NO_URLS}
      </p>
    );
  }

  return (
    <div className="space-y-0" data-testid="endpoint-table">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 pb-2 border-b border-neutral-800">
        <span className="col-span-4 text-[10px] uppercase tracking-widest text-neutral-500">
          Endpoint
        </span>
        <span className="col-span-5 text-[10px] uppercase tracking-widest text-neutral-500">
          Performance
        </span>
        <span className="col-span-3 text-[10px] uppercase tracking-widest text-neutral-500 text-right">
          Action
        </span>
      </div>

      {/* Rows */}
      {health.urlScores.map((urlScore) => {
        const variant = classifyScore(urlScore.score);
        const barColor =
          variant === "success"
            ? "bg-green-400"
            : variant === "warning"
              ? "bg-yellow-400"
              : variant === "error"
                ? "bg-red-400"
                : "bg-neutral-600";
        const barWidth = urlScore.score !== null ? `${urlScore.score}%` : "0%";

        return (
          <div
            key={urlScore.urlId}
            data-testid="endpoint-row"
            className="grid grid-cols-12 gap-2 items-center py-3 border-b border-neutral-800/50"
          >
            {/* URL name + path */}
            <div className="col-span-4">
              <p className="text-sm font-medium text-neutral-200 truncate">{urlScore.label}</p>
              <p className="text-xs text-neutral-500 truncate">{urlScore.url}</p>
            </div>

            {/* Performance bar + score */}
            <div className="col-span-5 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} motion-reduce:transition-none`}
                  style={{ width: barWidth }}
                />
              </div>
              <span className="text-sm font-medium text-neutral-200 w-8 text-right">
                {urlScore.score !== null ? Math.round(urlScore.score) : "—"}
              </span>
            </div>

            {/* AC11: Run Audit button */}
            <div className="col-span-3 text-right">
              <Button
                variant="secondary"
                size="sm"
                data-testid="endpoint-run-audit"
                onClick={() => {
                  router.push(`/audit?url=${encodeURIComponent(urlScore.url)}`);
                }}
              >
                {/* copy: project-overview-run-audit */}
                {COPY_RUN_AUDIT}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page component                                                 */
/* ------------------------------------------------------------------ */

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  /* v8 ignore next -- params.id is always string from Next.js dynamic route */
  const projectId = typeof params.id === "string" ? params.id : "";

  const [state, setState] = useState<PageState>("loading");
  const [projectName, setProjectName] = useState<string>("");
  const [health, setHealth] = useState<ProjectHealthResponse | null>(null);
  const [audits, setAudits] = useState<ProjectAuditsResponse | null>(null);
  const [trends, setTrends] = useState<ProjectTrendsResponse | null>(null);

  /* AC15: trackPageView on mount */
  useEffect(() => {
    trackPageView({ route: `/projects/${projectId}`, timestamp: Date.now() });
  }, [projectId]);

  /* Fetch all data in parallel */
  const fetchData = useCallback(async () => {
    setState("loading");
    try {
      const [projectDetail, healthData, auditsData, trendsData] = await Promise.all([
        getProject(projectId),
        getProjectHealth(projectId),
        getProjectAudits(projectId),
        getProjectTrends(projectId),
      ]);

      setProjectName(projectDetail.project.name);
      setHealth(healthData);
      setAudits(auditsData);
      setTrends(trendsData);
      setState("success");
    } catch (err) {
      const error = err as Error & { status?: number };
      if (error.status === 404) {
        router.push("/dashboard");
        return;
      }
      setState("error");
    }
  }, [projectId]); // router excluded: stable ref from useRouter, including it causes infinite re-render

  useEffect(() => {
    if (projectId !== "") {
      void fetchData();
    }
  }, [projectId, fetchData]);

  return (
    <MotionWrapper>
      <div className="p-6 lg:p-8">
        {/* AC2: Breadcrumb */}
        <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-sm">
            <li>
              <Link
                href="/dashboard"
                className="text-neutral-400 hover:text-neutral-200 transition-colors motion-reduce:transition-none"
                data-testid="breadcrumb-dashboard"
              >
                Dashboard
              </Link>
            </li>
            <li className="text-neutral-600" aria-hidden="true">
              &gt;
            </li>
            <li className="text-neutral-200 font-medium" data-testid="breadcrumb-project">
              {projectName || "Project"}
            </li>
          </ol>
        </nav>

        {/* Header with CTA */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-medium text-neutral-50" data-testid="project-heading">
            {projectName || "Project Overview"}
          </h1>
          {/* AC3: Start New Project Audit CTA */}
          <Button
            variant="primary"
            size="sm"
            data-testid="start-audit-cta"
            onClick={() => {
              router.push("/audit");
            }}
          >
            {/* copy: project-overview-start-audit */}
            {COPY_START_AUDIT}
          </Button>
        </div>

        {/* Content area with project sidebar */}
        <div className="flex gap-6">
          {/* AC8: Project-scoped sidebar */}
          <ProjectSidebar />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {state === "loading" && <ProjectOverviewSkeleton />}
            {state === "error" && <ProjectOverviewError onRetry={fetchData} />}
            {state === "success" && health !== null && audits !== null && trends !== null && (
              <div
                data-testid="project-overview-content"
                className="grid grid-cols-1 md:grid-cols-12 gap-4"
              >
                {/* Section 1: Overall Project Health (AC4) */}
                <BentoSection
                  title={COPY_HEALTH_HEADING}
                  testId="bento-health"
                  className="md:col-span-4"
                >
                  <HealthCardContent health={health} />
                </BentoSection>

                {/* Section 2: Performance Trends (AC5) */}
                <BentoSection
                  title={COPY_TRENDS_HEADING}
                  testId="bento-trends"
                  className="md:col-span-8"
                >
                  <TrendChart
                    cruxAvailable={trends.cruxAvailable}
                    cruxPeriods={trends.cruxPeriods}
                    labDataPoints={trends.labDataPoints}
                  />
                </BentoSection>

                {/* Section 3: Audit Log (AC6) */}
                <BentoSection
                  title={COPY_AUDIT_LOG_HEADING}
                  testId="bento-audit-log"
                  className="md:col-span-6"
                >
                  <AuditLogContent audits={audits} />
                </BentoSection>

                {/* Section 4: Endpoint Registry (AC7) */}
                <BentoSection
                  title={COPY_ENDPOINT_HEADING}
                  testId="bento-endpoint"
                  className="md:col-span-6"
                >
                  <EndpointRegistryContent health={health} />
                </BentoSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </MotionWrapper>
  );
}
