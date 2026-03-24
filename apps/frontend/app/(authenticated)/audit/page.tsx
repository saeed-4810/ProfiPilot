"use client";

/**
 * Audit page — Stitch "Audit Setup v1" design (pixel-accurate).
 *
 * PERF-155: Redesign audit page to match Stitch hero input card layout.
 *
 * Layout matches Stitch HTML exactly:
 * - pt-16 px-10 pb-20 (layout already adds pt-16 for nav = total pt-32)
 * - max-w-5xl mx-auto content container
 * - mb-16 text-center hero with text-4xl font-light heading
 * - bg-[#141314] elevated input card with link icon + Run Audit CTA
 * - Engine settings row below input inside card
 * - Recent Projects section with mt-24 (placeholder for MVP)
 *
 * All business logic preserved from original implementation.
 */

import { useState, useRef, useCallback, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { MotionWrapper } from "@/components/MotionWrapper";
import { trackPageView, trackAuditTrigger } from "@/lib/analytics";
import { AuditProgress } from "@/components/ui/AuditProgress";
import {
  createAudit,
  getAuditStatus,
  getRecentAudits,
  isTerminalStatus,
  COPY_URL_VALIDATION_ERROR,
  COPY_ONBOARDING_HELPER,
  COPY_AUDIT_FAILED,
  COPY_AUDIT_COMPLETED,
  type AuditStatus,
  type AuditStrategy,
  type RecentAuditItem,
} from "@/lib/audit";

/* ------------------------------------------------------------------ */
/* Zod schema — valid HTTPS URL                                       */
/* ------------------------------------------------------------------ */

const AuditUrlSchema = z.object({
  url: z
    .string()
    .min(1, COPY_URL_VALIDATION_ERROR)
    .url(COPY_URL_VALIDATION_ERROR)
    .refine((val) => val.startsWith("https://"), { message: COPY_URL_VALIDATION_ERROR }),
});

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states)                         */
/* ------------------------------------------------------------------ */

type PageState = "empty" | "loading" | "success" | "error" | "blocked";

/** Polling interval in milliseconds (3 seconds per requirements). */
const POLL_INTERVAL_MS = 3_000;

/** Step advance interval for time-based simulation (C1a). */
const STEP_ADVANCE_MS = 4_000;

/** Total number of progress steps. */
const TOTAL_STEPS = 5;

/* ------------------------------------------------------------------ */
/* Recent audit helpers — Stitch design tokens                        */
/* ------------------------------------------------------------------ */

/** Status icon name for the recent audit row. */
function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "task_alt";
    case "failed":
    case "cancelled":
      return "priority_high";
    default:
      return "schedule";
  }
}

/** Status icon container style (bg + text color). */
function getStatusIconStyle(status: string): string {
  switch (status) {
    case "completed":
      return "bg-[#4ae176]/10 text-[#4ae176]";
    case "failed":
    case "cancelled":
      return "bg-[#ffb95f]/10 text-[#ffb95f]";
    default:
      return "bg-white/5 text-gray-500";
  }
}

/** Score color based on Lighthouse thresholds (0-1 scale). */
function getScoreColor(score: number): string {
  if (score >= 0.9) return "text-[#4ae176]";
  if (score >= 0.5) return "text-[#ffb95f]";
  return "text-red-400";
}

/** Format ISO timestamp to relative time string. */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay === 1) return "Yesterday";
  return `${diffDay} days ago`;
}

/* ------------------------------------------------------------------ */
/* AuditPage component                                                */
/* ------------------------------------------------------------------ */

export default function AuditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillUrl = searchParams.get("url");

  /* --- State --- */
  const [pageState, setPageState] = useState<PageState>("empty");
  const [auditStatus, setAuditStatus] = useState<AuditStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<number>(0);
  const [strategy, setStrategy] = useState<AuditStrategy>("mobile");
  const [strategyOpen, setStrategyOpen] = useState(false);

  /* --- Recent audits state --- */
  const [recentAudits, setRecentAudits] = useState<RecentAuditItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentPage, setRecentPage] = useState(1);
  const [recentTotal, setRecentTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  /* --- Refs --- */
  const urlInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  /** Stop any active polling interval. */
  const stopPolling = useCallback(() => {
    if (pollRef.current !== undefined) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }, []);

  /** Stop the step advance timer. */
  const stopStepTimer = useCallback(() => {
    if (stepTimerRef.current !== undefined) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = undefined;
    }
  }, []);

  /** Start time-based step simulation (C1a). Advances step every 4s while running. */
  const startStepTimer = useCallback(() => {
    stopStepTimer();
    stepTimerRef.current = setInterval(() => {
      setProgressStep((prev) => {
        if (prev < TOTAL_STEPS - 2) {
          return prev + 1;
        }
        return prev;
      });
    }, STEP_ADVANCE_MS);
  }, [stopStepTimer]);

  /* --- Track page view + cleanup polling/timers on unmount --- */
  useEffect(() => {
    trackPageView({ route: "/audit", timestamp: Date.now() });
    return () => {
      stopPolling();
      stopStepTimer();
    };
  }, [stopPolling, stopStepTimer]);

  /* --- Fetch recent audits on mount --- */
  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    getRecentAudits(1, 5)
      .then((res) => {
        if (!cancelled) {
          setRecentAudits(res.items);
          setRecentTotal(res.total);
          setRecentPage(1);
        }
      })
      .catch(() => {
        /* Silently fail — recent audits is non-critical UI */
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- Load more recent audits --- */
  const handleLoadMore = useCallback(() => {
    const nextPage = recentPage + 1;
    setLoadingMore(true);
    getRecentAudits(nextPage, 5)
      .then((res) => {
        setRecentAudits((prev) => [...prev, ...res.items]);
        setRecentTotal(res.total);
        setRecentPage(nextPage);
      })
      .catch(() => {
        /* Silently fail */
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [recentPage]);

  /* --- Pre-fill URL from query param --- */
  useEffect(() => {
    /* v8 ignore next 3 -- prefill branch: only fires when navigated from dashboard with ?url= param */
    if (prefillUrl !== null && prefillUrl !== "" && urlInputRef.current !== null) {
      urlInputRef.current.value = prefillUrl;
    }
  }, [prefillUrl]);

  /* --- Poll audit status --- */
  const startPolling = useCallback(
    (id: string) => {
      stopPolling();

      pollRef.current = setInterval(async () => {
        try {
          const result = await getAuditStatus(id);
          setAuditStatus(result.status);

          if (isTerminalStatus(result.status)) {
            stopPolling();
            stopStepTimer();

            if (result.status === "completed") {
              setProgressStep(TOTAL_STEPS - 1);
              setPageState("success");
              setTimeout(() => {
                router.push(`/results?id=${id}`);
              }, 1_000);
            } else if (result.status === "failed" || result.status === "cancelled") {
              setPageState("error");
              setError(result.lastError ?? COPY_AUDIT_FAILED);
            }
          }
        } catch (err: unknown) {
          const typedErr = err as Error & { status?: number };
          if (typedErr.status === 401) {
            stopPolling();
            setPageState("blocked");
            router.push("/login");
          }
        }
      }, POLL_INTERVAL_MS);
    },
    [router, stopPolling, stopStepTimer]
  );

  /* --- Form submission --- */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setFieldError(null);

      const formData = new FormData(e.currentTarget);
      const raw = { url: String(formData.get("url")) };

      const parsed = AuditUrlSchema.safeParse(raw);
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const urlErr = flat["url"]?.[0];
        if (urlErr !== undefined) {
          setFieldError(urlErr);
        }
        urlInputRef.current?.focus();
        return;
      }

      trackAuditTrigger({ url: parsed.data.url, timestamp: Date.now() });
      setPageState("loading");
      setAuditStatus("queued");
      setProgressStep(0);

      try {
        const result = await createAudit(parsed.data.url, strategy);
        setJobId(result.jobId);
        setAuditStatus(result.status);
        startPolling(result.jobId);
        startStepTimer();
      } catch (err: unknown) {
        const typedErr = err as Error & { status?: number; code?: string };

        if (typedErr.status === 401) {
          setPageState("blocked");
          router.push("/login");
          return;
        }

        if (typedErr.status === 400) {
          setFieldError(typedErr.message || COPY_URL_VALIDATION_ERROR);
          setPageState("empty");
          return;
        }

        setError(typedErr.message || "An unexpected error occurred.");
        setPageState("error");
        setTimeout(() => errorRef.current?.focus(), 50);
      }
    },
    [router, startPolling, startStepTimer]
  );

  /* --- Retry handler --- */
  const handleRetry = useCallback(() => {
    setPageState("empty");
    setError(null);
    setFieldError(null);
    setAuditStatus(null);
    setJobId(null);
    setProgressStep(0);
    stopStepTimer();
    setTimeout(() => urlInputRef.current?.focus(), 50);
  }, [stopStepTimer]);

  /* --- Derived state --- */
  const isLoading = pageState === "loading";

  return (
    <MotionWrapper>
      {/* Stitch: pt-16 here + layout pt-16 = total pt-32, px-10, pb-20 */}
      <div data-testid="audit-page" className="min-h-screen pt-16 px-10 pb-20">
        <div className="max-w-5xl mx-auto">
          {/* -------------------------------------------------------- */}
          {/* Hero heading — Stitch: mb-16 text-center                 */}
          {/* -------------------------------------------------------- */}
          <div className="mb-16 text-center">
            <h1 className="text-4xl font-light tracking-tight text-[#e5e2e3] mb-3">New Audit</h1>
            {/* Stitch subtitle — always visible */}
            <p className="text-gray-500 text-lg font-light">Enter a URL to begin your analysis.</p>
            {/* copy: onboarding-helper — screen-reader accessible, visually hidden when subtitle shows */}
            {pageState === "empty" && (
              <p data-testid="audit-helper" className="sr-only">
                {COPY_ONBOARDING_HELPER}
              </p>
            )}
          </div>

          {/* -------------------------------------------------------- */}
          {/* Error state with progress indicator                      */}
          {/* -------------------------------------------------------- */}
          {pageState === "error" && auditStatus !== null && auditStatus !== "queued" && (
            <div data-testid="audit-error-progress" className="mb-8">
              <AuditProgress
                currentStep={progressStep}
                failed={true}
                /* v8 ignore next -- defensive: error is always set before reaching error+progress state */
                errorMessage={error ?? COPY_AUDIT_FAILED}
              />
            </div>
          )}

          {/* Error banner — general errors */}
          {pageState === "error" &&
            (auditStatus === null || auditStatus === "queued") &&
            error !== null && (
              <div
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                data-testid="audit-error"
                className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-3"
              >
                <span
                  className="material-symbols-outlined text-red-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                >
                  error
                </span>
                <span>{error}</span>
              </div>
            )}

          {/* -------------------------------------------------------- */}
          {/* Elevated input card — exact Stitch layout                */}
          {/* bg-surface-container-low (#141314)                       */}
          {/* border-white/[0.06] rounded-2xl p-4 md:p-6 shadow-2xl   */}
          {/* -------------------------------------------------------- */}
          {(pageState === "empty" || pageState === "error") && (
            <div className="relative">
              <div className="bg-[#141314] border border-white/[0.06] rounded-2xl p-4 md:p-6 shadow-2xl">
                <form onSubmit={handleSubmit} noValidate>
                  <div className="flex flex-col gap-6">
                    {/* URL input + Run Audit button — Stitch: flex-col md:flex-row gap-3 */}
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1 group">
                        {/* Link icon — Stitch: pl-5, text-gray-500, focus:text-primary */}
                        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#adc6ff] transition-colors">
                          <span className="material-symbols-outlined text-xl" aria-hidden="true">
                            link
                          </span>
                        </div>
                        {/* Input — Stitch: bg-surface-container (#18181a), h-14, pl-14, rounded-xl */}
                        <input
                          ref={urlInputRef}
                          id="audit-url"
                          name="url"
                          type="url"
                          autoComplete="url"
                          required
                          aria-label="Website URL"
                          aria-invalid={fieldError !== null ? "true" : undefined}
                          aria-describedby={fieldError !== null ? "url-error" : undefined}
                          disabled={isLoading}
                          data-testid="audit-url-input"
                          className="w-full bg-[#18181a] border border-white/[0.03] focus:border-[#adc6ff]/40 focus:ring-0 h-14 pl-14 pr-4 rounded-xl text-base placeholder:text-gray-600 transition-all outline-none text-[#e5e2e3]"
                          placeholder="https://example.com"
                        />
                      </div>

                      {/* Run Audit — Stitch: bg-primary (#adc6ff), text-on-primary (#002e6a), h-14 px-10 */}
                      <button
                        type="submit"
                        disabled={isLoading}
                        data-testid="audit-submit"
                        className="h-14 px-10 bg-[#adc6ff] text-[#002e6a] font-medium text-base rounded-xl hover:bg-[#d8e2ff] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#adc6ff]/5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>Run Audit</span>
                      </button>
                    </div>

                    {/* Field error — inline below input */}
                    {fieldError !== null && (
                      <p
                        id="url-error"
                        data-testid="audit-field-error"
                        className="text-sm text-red-400 px-2 -mt-4"
                      >
                        {fieldError}
                      </p>
                    )}

                    {/* Engine Settings — Stitch card design */}
                    <div data-testid="engine-settings">
                      {/* Header row */}
                      <div className="flex items-center justify-between px-2 mb-3">
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium uppercase tracking-[0.15em]">
                          <span className="material-symbols-outlined text-base" aria-hidden="true">
                            settings_input_component
                          </span>
                          <span>Engine Settings</span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-gray-600">
                          <span className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-[#4ae176]" />
                            Engine Ready
                          </span>
                          <span className="flex items-center gap-1" data-testid="audit-count">
                            <span className="material-symbols-outlined text-xs" aria-hidden="true">
                              history
                            </span>
                            {recentTotal} audit{recentTotal === 1 ? "" : "s"} total
                          </span>
                        </div>
                      </div>

                      {/* Strategy dropdown card — Stitch style, 1/3 width */}
                      <div className="relative w-1/3" data-testid="strategy-dropdown">
                        <button
                          type="button"
                          onClick={() => setStrategyOpen((prev) => !prev)}
                          data-testid="strategy-trigger"
                          aria-expanded={strategyOpen}
                          aria-haspopup="listbox"
                          className="w-full p-4 rounded-xl border border-white/[0.06] bg-[#18181a] text-left transition-all hover:border-white/10"
                        >
                          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
                            Analysis Profile
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#e5e2e3]">
                              {strategy === "mobile" && "Mobile Emulation"}
                              {strategy === "desktop" && "Desktop"}
                              {strategy === "both" && "Both (Mobile + Desktop)"}
                            </span>
                            <span
                              className="material-symbols-outlined text-gray-500 text-lg"
                              aria-hidden="true"
                            >
                              edit
                            </span>
                          </div>
                        </button>

                        {/* Dropdown options */}
                        {strategyOpen && (
                          <div
                            role="listbox"
                            aria-label="Analysis profile options"
                            data-testid="strategy-options"
                            className="absolute top-full left-0 right-0 mt-2 bg-[#222122] border border-white/10 rounded-xl shadow-2xl py-2 z-10"
                          >
                            {(
                              [
                                { value: "mobile", label: "Mobile Emulation" },
                                { value: "desktop", label: "Desktop" },
                                { value: "both", label: "Both (Mobile + Desktop)" },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                role="option"
                                aria-selected={strategy === opt.value}
                                data-testid={`strategy-option-${opt.value}`}
                                onClick={() => {
                                  setStrategy(opt.value);
                                  setStrategyOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 flex items-center justify-between transition-colors ${
                                  strategy === opt.value ? "text-[#e5e2e3]" : "text-gray-500"
                                }`}
                              >
                                <span>{opt.label}</span>
                                {strategy === opt.value && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ae176]" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Loading / progress state                                 */}
          {/* -------------------------------------------------------- */}
          {pageState === "loading" && (
            <div data-testid="audit-progress" className="mt-8">
              <AuditProgress currentStep={progressStep} failed={false} />
              {jobId !== null && (
                <p data-testid="audit-job-id" className="text-gray-600 text-xs text-center mt-4">
                  Job: {jobId}
                </p>
              )}
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Success state                                            */}
          {/* -------------------------------------------------------- */}
          {pageState === "success" && (
            <div data-testid="audit-success" className="mt-8">
              <AuditProgress currentStep={TOTAL_STEPS - 1} failed={false} />
              <p
                data-testid="audit-status-message"
                className="text-[#4ae176] text-sm font-medium text-center mt-4"
              >
                {COPY_AUDIT_COMPLETED}
              </p>
              <p className="text-gray-600 text-xs text-center mt-1">Redirecting to results...</p>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Error state — retry CTA                                  */}
          {/* -------------------------------------------------------- */}
          {pageState === "error" && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleRetry}
                data-testid="audit-retry"
                className="h-12 px-8 rounded-xl bg-white/5 border border-white/[0.06] text-[#e5e2e3] font-medium hover:bg-white/10 transition-all"
              >
                Try Again
              </button>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Recent Projects — Stitch: mt-24 max-w-4xl               */}
          {/* -------------------------------------------------------- */}
          <div className="mt-24 max-w-4xl mx-auto" data-testid="recent-projects">
            <div className="flex items-center justify-between mb-8 px-2">
              <h2 className="text-[11px] uppercase tracking-[0.2em] font-medium text-gray-500">
                Recent Projects
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {/* Loading skeleton */}
              {recentLoading && (
                <div data-testid="recent-loading">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-5 p-4 rounded-xl animate-pulse">
                      <div className="w-9 h-9 rounded-lg bg-white/5" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-48 rounded bg-white/5" />
                        <div className="h-2.5 w-32 rounded bg-white/5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!recentLoading && recentAudits.length === 0 && (
                <div
                  data-testid="recent-empty"
                  className="flex items-center justify-center p-8 rounded-xl border border-white/[0.05] text-gray-600 text-sm"
                >
                  <span>No audits yet. Enter a URL above to get started.</span>
                </div>
              )}

              {/* Audit rows — Stitch design */}
              {!recentLoading &&
                recentAudits.map((audit) => (
                  <div
                    key={audit.jobId}
                    data-testid={`recent-audit-${audit.jobId}`}
                    onClick={() => {
                      if (audit.status === "completed") {
                        router.push(`/results?id=${audit.jobId}`);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && audit.status === "completed") {
                        router.push(`/results?id=${audit.jobId}`);
                      }
                    }}
                    role={audit.status === "completed" ? "link" : undefined}
                    tabIndex={audit.status === "completed" ? 0 : undefined}
                    className="group flex items-center justify-between p-4 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-white/[0.05] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      {/* Status icon — Stitch: colored bg circle */}
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${getStatusIconStyle(audit.status)}`}
                      >
                        <span className="material-symbols-outlined text-xl" aria-hidden="true">
                          {getStatusIcon(audit.status)}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium">
                          {audit.url.replace(/^https?:\/\//, "")}
                        </h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {formatRelativeTime(audit.createdAt)}
                          {audit.status === "completed" && audit.performanceScore !== null && (
                            <>
                              {" \u2022 "}
                              <span
                                className={`font-medium ${getScoreColor(audit.performanceScore)}`}
                              >
                                Score {Math.round(audit.performanceScore * 100)}
                              </span>
                            </>
                          )}
                          {audit.status === "failed" && (
                            <>
                              {" \u2022 "}
                              <span className="font-medium text-red-400">Failed</span>
                            </>
                          )}
                          {(audit.status === "queued" || audit.status === "running") && (
                            <>
                              {" \u2022 "}
                              <span className="font-medium text-[#adc6ff]">In progress</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-gray-700 group-hover:text-[#adc6ff] group-hover:translate-x-1 transition-all motion-reduce:transition-none">
                      chevron_right
                    </span>
                  </div>
                ))}
            </div>

            {/* Load more button — shown when more items exist */}
            {!recentLoading && recentAudits.length < recentTotal && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  data-testid="recent-load-more"
                  className="text-[11px] uppercase tracking-widest text-gray-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </MotionWrapper>
  );
}
