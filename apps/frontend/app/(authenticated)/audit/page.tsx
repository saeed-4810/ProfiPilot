"use client";

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
      <main
        data-testid="audit-page"
        className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-950 text-neutral-50"
      >
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2 text-center">Audit</h1>

          {/* copy: onboarding-helper — shown in empty state */}
          {pageState === "empty" && (
            <p data-testid="audit-helper" className="text-neutral-400 text-sm text-center mb-6">
              {COPY_ONBOARDING_HELPER}
            </p>
          )}

          {/* Error state with progress indicator showing failure point */}
          {pageState === "error" && auditStatus !== null && auditStatus !== "queued" && (
            <div data-testid="audit-error-progress" className="mb-4">
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
                className="mb-4 p-3 rounded bg-red-900/50 border border-red-500 text-red-200 text-sm"
              >
                {error}
              </div>
            )}

          {/* URL submission form — visible in empty and error states */}
          {(pageState === "empty" || pageState === "error") && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label
                  htmlFor="audit-url"
                  className="block text-sm font-medium text-neutral-300 mb-1"
                >
                  Website URL
                </label>
                <input
                  ref={urlInputRef}
                  id="audit-url"
                  name="url"
                  type="url"
                  autoComplete="url"
                  required
                  aria-invalid={fieldError !== null ? "true" : undefined}
                  aria-describedby={fieldError !== null ? "url-error" : undefined}
                  disabled={isLoading}
                  data-testid="audit-url-input"
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="https://example.com"
                />
                {/* copy: url-validation-error — inline field error */}
                {fieldError !== null && (
                  <p
                    id="url-error"
                    data-testid="audit-field-error"
                    className="mt-1 text-sm text-red-400"
                  >
                    {fieldError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                data-testid="audit-submit"
                className="w-full py-2 px-4 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Run Audit
              </button>
            </form>
          )}

          {/* Loading / progress state — multi-step progress indicator (PERF-142) */}
          {pageState === "loading" && (
            <div data-testid="audit-progress" className="mt-6">
              <AuditProgress currentStep={progressStep} failed={false} />
              {jobId !== null && (
                <p data-testid="audit-job-id" className="text-neutral-500 text-xs text-center mt-4">
                  Job: {jobId}
                </p>
              )}
            </div>
          )}

          {/* Success state — all steps completed, redirecting */}
          {pageState === "success" && (
            <div data-testid="audit-success" className="mt-6">
              <AuditProgress currentStep={TOTAL_STEPS - 1} failed={false} />
              <p
                data-testid="audit-status-message"
                className="text-green-400 text-sm font-medium text-center mt-4"
              >
                {COPY_AUDIT_COMPLETED}
              </p>
              <p className="text-neutral-500 text-xs text-center mt-1">Redirecting to results...</p>
            </div>
          )}

          {/* Error state — retry CTA */}
          {pageState === "error" && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleRetry}
                data-testid="audit-retry"
                className="py-2 px-4 rounded bg-neutral-700 text-neutral-200 font-medium hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}
