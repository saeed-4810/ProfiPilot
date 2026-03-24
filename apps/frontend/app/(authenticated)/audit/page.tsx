"use client";

/**
 * Audit page — Stitch "Audit Setup v1" design.
 *
 * PERF-155: Redesign audit page to match Stitch hero input card layout.
 *
 * Layout: Centered "New Audit" hero → elevated input card with link icon
 * prefix + Run Audit CTA → progress/error/success states below card.
 *
 * All business logic preserved from original implementation:
 * - Zod URL validation (HTTPS only)
 * - createAudit → polling → redirect to /results
 * - 5-state page model (empty/loading/success/error/blocked)
 * - AuditProgress stepper for loading/error states
 * - Retry handler
 * - Analytics: trackPageView on mount, trackAuditTrigger on submit
 * - ?url= prefill from dashboard
 *
 * Stitch design tokens:
 * - bg-[#141314] (surface-container-low) for input card
 * - border-white/[0.06] card border
 * - bg-[#18181a] (surface-container) for input field
 * - bg-[#adc6ff] text-[#002e6a] for Run Audit button
 * - text-4xl font-light tracking-tight for heading
 * - Manrope font (inherited from root layout)
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
  isTerminalStatus,
  COPY_URL_VALIDATION_ERROR,
  COPY_ONBOARDING_HELPER,
  COPY_AUDIT_FAILED,
  COPY_AUDIT_COMPLETED,
  type AuditStatus,
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
        // Don't advance past step 3 (0-indexed) — step 4 is reserved for "completed"
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

  /* --- Pre-fill URL from query param (e.g., from dashboard "Run first audit") --- */
  useEffect(() => {
    /* v8 ignore next 3 -- prefill branch: only fires when navigated from dashboard with ?url= param */
    if (prefillUrl !== null && prefillUrl !== "" && urlInputRef.current !== null) {
      urlInputRef.current.value = prefillUrl;
    }
  }, [prefillUrl]);

  /* --- Poll audit status --- */
  const startPolling = useCallback(
    (id: string) => {
      // Clear any existing poll before starting a new one
      stopPolling();

      pollRef.current = setInterval(async () => {
        try {
          const result = await getAuditStatus(id);
          setAuditStatus(result.status);

          if (isTerminalStatus(result.status)) {
            stopPolling();
            stopStepTimer();

            if (result.status === "completed") {
              // Set all steps to completed
              setProgressStep(TOTAL_STEPS - 1);
              setPageState("success");
              // Brief delay so user sees all checkmarks before redirect
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
            // Blocked state — not authenticated
            stopPolling();
            setPageState("blocked");
            router.push("/login");
          }
          // For other polling errors, keep polling — transient failures are expected
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

      // Client-side Zod validation
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

      // Transition to loading state
      trackAuditTrigger({ url: parsed.data.url, timestamp: Date.now() });
      setPageState("loading");
      setAuditStatus("queued");
      setProgressStep(0);

      try {
        const result = await createAudit(parsed.data.url);
        setJobId(result.jobId);
        setAuditStatus(result.status);
        startPolling(result.jobId);
        startStepTimer();
      } catch (err: unknown) {
        const typedErr = err as Error & { status?: number; code?: string };

        if (typedErr.status === 401) {
          // Blocked state — not authenticated
          setPageState("blocked");
          router.push("/login");
          return;
        }

        if (typedErr.status === 400) {
          // Validation error from server
          setFieldError(typedErr.message || COPY_URL_VALIDATION_ERROR);
          setPageState("empty");
          return;
        }

        // General error
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
      <div data-testid="audit-page" className="min-h-screen px-4 md:px-10 pb-20 pt-16">
        <div className="max-w-5xl mx-auto">
          {/* -------------------------------------------------------- */}
          {/* Hero heading — Stitch: centered, light weight            */}
          {/* -------------------------------------------------------- */}
          <div className="mb-16 text-center">
            <h1 className="text-4xl font-light tracking-tight text-[#e5e2e3] mb-3">New Audit</h1>

            {/* copy: onboarding-helper — shown in empty state */}
            {pageState === "empty" && (
              <p data-testid="audit-helper" className="text-gray-500 text-lg font-light">
                {COPY_ONBOARDING_HELPER}
              </p>
            )}

            {/* Subtitle for non-empty states */}
            {pageState !== "empty" && (
              <p className="text-gray-500 text-lg font-light">
                Enter a URL to begin your analysis.
              </p>
            )}
          </div>

          {/* -------------------------------------------------------- */}
          {/* Error state with progress indicator showing failure point */}
          {/* -------------------------------------------------------- */}
          {pageState === "error" && auditStatus !== null && auditStatus !== "queued" && (
            <div data-testid="audit-error-progress" className="max-w-2xl mx-auto mb-8">
              <AuditProgress
                currentStep={progressStep}
                failed={true}
                /* v8 ignore next -- defensive: error is always set before reaching error+progress state */
                errorMessage={error ?? COPY_AUDIT_FAILED}
              />
            </div>
          )}

          {/* Error banner — general errors (not field-level, no progress context) */}
          {pageState === "error" &&
            (auditStatus === null || auditStatus === "queued") &&
            error !== null && (
              <div
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                data-testid="audit-error"
                className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-3"
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
          {/* Elevated input card — Stitch design                      */}
          {/* -------------------------------------------------------- */}
          {(pageState === "empty" || pageState === "error") && (
            <div className="relative">
              <div className="bg-[#141314] border border-white/[0.06] rounded-2xl p-4 md:p-6 shadow-2xl">
                <form onSubmit={handleSubmit} noValidate>
                  <div className="flex flex-col gap-6">
                    {/* URL input + Run Audit button row */}
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1 group">
                        {/* Link icon prefix */}
                        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#adc6ff] transition-colors">
                          <span className="material-symbols-outlined text-xl" aria-hidden="true">
                            link
                          </span>
                        </div>
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

                      {/* Run Audit button — Stitch primary style */}
                      <button
                        type="submit"
                        disabled={isLoading}
                        data-testid="audit-submit"
                        className="h-14 px-10 bg-[#adc6ff] text-[#002e6a] font-medium text-base rounded-xl hover:bg-[#d8e2ff] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#adc6ff]/5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Run Audit
                      </button>
                    </div>

                    {/* Field error — inline below input inside card */}
                    {fieldError !== null && (
                      <p
                        id="url-error"
                        data-testid="audit-field-error"
                        className="text-sm text-red-400 px-2 -mt-4"
                      >
                        {fieldError}
                      </p>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Loading / progress state — multi-step progress (PERF-142)*/}
          {/* -------------------------------------------------------- */}
          {pageState === "loading" && (
            <div data-testid="audit-progress" className="max-w-2xl mx-auto mt-8">
              <AuditProgress currentStep={progressStep} failed={false} />
              {jobId !== null && (
                <p data-testid="audit-job-id" className="text-gray-600 text-xs text-center mt-4">
                  Job: {jobId}
                </p>
              )}
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Success state — all steps completed, redirecting          */}
          {/* -------------------------------------------------------- */}
          {pageState === "success" && (
            <div data-testid="audit-success" className="max-w-2xl mx-auto mt-8">
              <AuditProgress currentStep={TOTAL_STEPS - 1} failed={false} />
              <p
                data-testid="audit-status-message"
                className="text-green-400 text-sm font-medium text-center mt-4"
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
        </div>
      </div>
    </MotionWrapper>
  );
}
