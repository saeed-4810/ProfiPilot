"use client";

/**
 * AuditProgress — Multi-step narrative progress indicator for audit jobs.
 *
 * Based on 21st.dev registration-stepper pattern (ravikatiyar/registration-stepper):
 *   - AnimatePresence for icon transitions (check ↔ circle ↔ spinner)
 *   - Spring physics on icon swap (stiffness: 400, damping: 20)
 *   - Active step scales up (1.1x) with glow pulse
 *   - Lucide icons (CheckCircle2, Circle, XCircle, Loader2)
 *   - Card wrapper with border + shadow
 *   - Connector lines with scaleY fill animation
 *
 * Adapted to ADR-025 dark palette:
 *   - bg-neutral-900 card, border-neutral-800, text-neutral-50
 *   - Green-400 completed, blue-500 active, red-400 failed, neutral-700 pending
 *   - useReducedMotion() two-layer a11y
 *
 * Scenarios: P-PERF-142-001..002, U-PERF-142-001..003, T-PERF-142-001..002
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type StepStatus = "pending" | "active" | "completed" | "failed";

export interface AuditProgressStep {
  readonly label: string;
  readonly status: StepStatus;
}

export interface AuditProgressProps {
  /** Current step index (0-based). -1 means idle (no steps active). */
  currentStep: number;
  /** Total number of steps. Defaults to 5. */
  totalSteps?: number;
  /** Whether the audit has failed. Shows error on the active step. */
  failed?: boolean;
  /** Error message to display when failed. */
  errorMessage?: string;
}

/* ------------------------------------------------------------------ */
/* Step definitions                                                    */
/* ------------------------------------------------------------------ */

interface StepDefinition {
  readonly label: string;
  readonly detail: string;
}

const STEPS: readonly StepDefinition[] = [
  {
    label: "Fetching your page...",
    detail: "Loading the page in a real Chromium browser to capture how it renders for users.",
  },
  {
    label: "Running performance analysis...",
    detail: "Lighthouse is auditing load speed, render timing, and resource efficiency.",
  },
  {
    label: "Measuring Core Web Vitals...",
    detail: "Calculating LCP, CLS, and TBT — the metrics Google uses for search ranking.",
  },
  {
    label: "Analyzing results with AI...",
    detail: "Our AI is reading the raw metrics and identifying the highest-impact improvements.",
  },
  {
    label: "Generating recommendations...",
    detail: "Building prioritized developer tickets with effort estimates and fix suggestions.",
  },
] as const;

const STEP_LABELS: readonly string[] = STEPS.map((s) => s.label);

/* ------------------------------------------------------------------ */
/* Rotating tips — shown below the card while waiting                  */
/* ------------------------------------------------------------------ */

const AUDIT_TIPS: readonly string[] = [
  "💡 A 1-second improvement in LCP can increase conversions by up to 27%.",
  "📊 Google uses Core Web Vitals as a ranking signal — better scores = better SEO.",
  "⚡ The fastest e-commerce sites load in under 1.8 seconds on mobile.",
  "🎯 53% of mobile users abandon sites that take longer than 3 seconds to load.",
  "🔍 NimbleVitals uses the same Lighthouse engine as Chrome DevTools and PageSpeed Insights.",
  "📱 Performance matters most on mobile — we test with a simulated 4G connection.",
  "🏆 Rakuten saw +53% revenue per visitor after improving their Core Web Vitals.",
  "🛠️ Each recommendation includes a suggested fix and effort estimate for your dev team.",
] as const;

/* ------------------------------------------------------------------ */
/* Animation variants (from 21st.dev registration-stepper pattern)     */
/* ------------------------------------------------------------------ */

const PREFPILOT_EASING: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/** Icon swap animation — spring physics from registration-stepper */
const iconVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 400, damping: 20 },
  },
};

/* ------------------------------------------------------------------ */
/* Sub-components (Lucide-style icons adapted to ADR-025 palette)      */
/* ------------------------------------------------------------------ */

/** Animated checkmark circle for completed steps — Lucide CheckCircle2 style. */
function CheckIcon({ reduced }: { reduced: boolean }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="check"
        variants={iconVariants}
        initial={reduced ? false : "hidden"}
        animate="visible"
        data-testid="step-checkmark"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4ade80"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" opacity={0.2} />
          <motion.path
            d="M9 12l2 2 4-4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={
              /* v8 ignore next 2 -- animation timing branch only evaluated by framer-motion runtime */
              reduced ? { duration: 0.01 } : { duration: 0.4, ease: PREFPILOT_EASING }
            }
          />
        </svg>
      </motion.div>
    </AnimatePresence>
  );
}

/** Error X circle for failed steps — Lucide XCircle style. */
function ErrorIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f87171"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="step-error-icon"
    >
      <circle cx="12" cy="12" r="10" opacity={0.2} />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

/** Spinning loader for active steps — Lucide Loader2 style with glow. */
function SpinnerIcon({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return (
      <div
        data-testid="step-spinner"
        className="h-5 w-5 rounded-full bg-blue-500"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="relative flex items-center justify-center" data-testid="step-spinner">
      {/* Glow pulse behind spinner — from multistep-form active step pattern */}
      <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md animate-pulse motion-reduce:animate-none" />
      <motion.svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2.5}
        strokeLinecap="round"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        aria-hidden="true"
      >
        <path d="M12 2a10 10 0 0 1 10 10" />
      </motion.svg>
    </div>
  );
}

/** Neutral circle for pending steps — Lucide Circle style. */
function PendingIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      data-testid="step-pending"
      className="text-neutral-700"
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Step icon resolver with AnimatePresence                              */
/* ------------------------------------------------------------------ */

function StepIcon({ status, reduced }: { status: StepStatus; reduced: boolean }) {
  switch (status) {
    case "completed":
      return <CheckIcon reduced={reduced} />;
    case "active":
      return <SpinnerIcon reduced={reduced} />;
    case "failed":
      return <ErrorIcon />;
    case "pending":
    default:
      return <PendingIcon />;
  }
}

/* ------------------------------------------------------------------ */
/* Connector line — scaleY fill from registration-stepper pattern       */
/* ------------------------------------------------------------------ */

function ConnectorLine({ completed, reduced }: { completed: boolean; reduced: boolean }) {
  return (
    <div className="ml-[10px] w-0.5 h-8 bg-neutral-800 relative" aria-hidden="true">
      {completed && (
        <motion.div
          className="absolute inset-0 bg-blue-500 rounded-full"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={
            /* v8 ignore next 2 -- animation timing branch only evaluated by framer-motion runtime */
            reduced ? { duration: 0.01 } : { duration: 0.3, ease: PREFPILOT_EASING }
          }
          style={{ transformOrigin: "top" }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component — card wrapper from registration-stepper pattern     */
/* ------------------------------------------------------------------ */

/** Interval for rotating tips (ms). */
const TIP_ROTATE_MS = 6_000;

export function AuditProgress({ currentStep, failed = false, errorMessage }: AuditProgressProps) {
  /* v8 ignore next -- useReducedMotion returns boolean|null; null fallback is defensive */
  const prefersReduced = useReducedMotion() ?? false;

  /* --- Rotating tip state --- */
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (failed) return;
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % AUDIT_TIPS.length);
    }, TIP_ROTATE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [failed]);

  const steps: AuditProgressStep[] = STEP_LABELS.map((label, index) => {
    let status: StepStatus = "pending";
    if (index < currentStep) {
      status = "completed";
    } else if (index === currentStep) {
      status = failed ? "failed" : "active";
    }
    return { label, status };
  });

  const progressPercent = failed
    ? Math.round((currentStep / STEP_LABELS.length) * 100)
    : Math.round(((currentStep + 1) / STEP_LABELS.length) * 100);

  return (
    <div
      role="progressbar"
      aria-label="Audit progress"
      aria-valuenow={progressPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid="audit-progress-stepper"
      className="w-full max-w-md mx-auto"
    >
      {/* Subtitle — visible during progress */}
      <p
        data-testid="audit-progress-subtitle"
        className="text-neutral-400 text-sm text-center mb-4"
      >
        {failed
          ? "Something went wrong during the audit."
          : "Your audit is running — this usually takes 15–30 seconds."}
      </p>

      {/* Card wrapper — adapted from registration-stepper bg-card pattern */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-sm">
        {/* Header — from registration-stepper headerTitle pattern */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-neutral-50">Audit Progress</h3>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              failed
                ? "text-red-400 bg-red-500/10"
                : progressPercent === 100
                  ? "text-green-400 bg-green-500/10"
                  : "text-blue-400 bg-blue-500/10"
            }`}
          >
            {failed ? "Failed" : progressPercent === 100 ? "Complete" : `${progressPercent}%`}
          </span>
        </div>

        {/* Live region for screen readers */}
        <div aria-live="polite" className="sr-only" data-testid="audit-progress-live">
          {/* v8 ignore next 3 -- optional chaining fallback is defensive; currentStep is always in bounds */}
          {failed
            ? `Audit failed at step ${currentStep + 1}: ${steps[currentStep]?.label ?? ""}`
            : `Step ${currentStep + 1} of ${STEP_LABELS.length}: ${steps[currentStep]?.label ?? ""}`}
        </div>

        {/* Step list — ol pattern from registration-stepper */}
        <ol className="space-y-0">
          {steps.map((step, index) => (
            <li key={step.label}>
              <div className="flex items-start gap-3">
                {/* Icon column with connector */}
                <div className="flex flex-col items-center">
                  {/* Icon container — scale animation from registration-stepper */}
                  <motion.div
                    className="relative flex h-6 w-6 items-center justify-center"
                    initial={prefersReduced ? false : { scale: 0.8, opacity: 0 }}
                    animate={{
                      scale: step.status === "active" ? 1.1 : 1,
                      opacity: 1,
                    }}
                    transition={
                      prefersReduced
                        ? { duration: 0.01 }
                        : {
                            duration: 0.3,
                            delay: index * 0.08,
                            ease: PREFPILOT_EASING,
                          }
                    }
                  >
                    <StepIcon status={step.status} reduced={prefersReduced} />
                  </motion.div>

                  {/* Connector line (not after last step) — h-8 for breathing room */}
                  {index < steps.length - 1 && (
                    <ConnectorLine completed={index < currentStep} reduced={prefersReduced} />
                  )}
                </div>

                {/* Label + detail column */}
                <div className="flex-1 pt-0.5 pb-1">
                  <span
                    data-testid={`step-label-${index}`}
                    className={`text-sm transition-colors duration-200 ${
                      step.status === "completed"
                        ? "text-green-400"
                        : step.status === "active"
                          ? "text-neutral-50 font-medium"
                          : step.status === "failed"
                            ? "text-red-400 font-medium"
                            : "text-neutral-500"
                    }`}
                  >
                    {step.label}
                  </span>
                  {/* Detail text — only shown for active step */}
                  {step.status === "active" && (
                    <p
                      data-testid={`step-detail-${index}`}
                      className="text-xs text-neutral-400 mt-0.5 leading-relaxed"
                    >
                      {/* v8 ignore next -- defensive: index is always in bounds when step is active */}
                      {STEPS[index]?.detail ?? ""}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Error message — outside card for visual separation */}
      {failed && errorMessage !== undefined && errorMessage !== "" && (
        <div
          role="alert"
          data-testid="audit-progress-error"
          className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
        >
          {errorMessage}
        </div>
      )}

      {/* Rotating tips — shown below card while waiting */}
      {!failed && (
        <div data-testid="audit-progress-tips" className="mt-5">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              data-testid="audit-tip-text"
              className="text-xs text-neutral-500 text-center px-4 leading-relaxed"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={
                prefersReduced ? { duration: 0.01 } : { duration: 0.4, ease: PREFPILOT_EASING }
              }
            >
              {AUDIT_TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton variant                                                    */
/* ------------------------------------------------------------------ */

export function AuditProgressSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading audit progress"
      data-testid="audit-progress-skeleton"
      className="w-full max-w-md mx-auto"
    >
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-sm">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-28 rounded bg-neutral-800 animate-pulse motion-reduce:animate-none" />
          <div className="h-5 w-12 rounded-full bg-neutral-800 animate-pulse motion-reduce:animate-none" />
        </div>
        {/* Step rows skeleton */}
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="h-6 w-6 rounded-full bg-neutral-800 animate-pulse motion-reduce:animate-none" />
                {index < 4 && <div className="w-0.5 h-8 bg-neutral-800" aria-hidden="true" />}
              </div>
              <div className="flex-1 pt-1">
                <div
                  className="h-3 rounded bg-neutral-800 animate-pulse motion-reduce:animate-none"
                  style={{ width: `${120 + index * 15}px` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
