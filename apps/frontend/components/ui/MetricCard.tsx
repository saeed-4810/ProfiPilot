"use client";

/**
 * MetricCard — CWV score gauge with traffic-light severity visualization.
 * Based on 21st.dev financial-score-cards (aliimam/financial-score-cards).
 *
 * Adapted to ADR-025 dark palette with Framer Motion pathLength animation.
 *
 * Scenarios: P-PERF-143-001, U-PERF-143-001, T-PERF-143-001
 */

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from "framer-motion";
import { Badge } from "@/components/ui/Badge";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type MetricRating = "good" | "needs-improvement" | "poor";

export interface MetricCardProps {
  /** Metric label, e.g. "LCP", "CLS", "TBT". */
  label: string;
  /** Performance score 0–100. */
  score: number;
  /** Formatted display value, e.g. "1.2s", "0.05", "120ms". */
  displayValue: string;
  /** CWV rating bucket. */
  rating: MetricRating;
  /** Full metric name, e.g. "Largest Contentful Paint". */
  description?: string;
}

/* ------------------------------------------------------------------ */
/* Rating → color / badge / icon mapping                               */
/* ------------------------------------------------------------------ */

const RATING_STROKE: Record<MetricRating, string> = {
  good: "#4ade80",
  "needs-improvement": "#facc15",
  poor: "#f87171",
};

const RATING_BADGE_VARIANT: Record<
  MetricRating,
  "severity-good" | "severity-warning" | "severity-error"
> = {
  good: "severity-good",
  "needs-improvement": "severity-warning",
  poor: "severity-error",
};

const RATING_LABEL: Record<MetricRating, string> = {
  good: "Good",
  "needs-improvement": "Needs Improvement",
  poor: "Poor",
};

/* ------------------------------------------------------------------ */
/* SVG gauge constants — half-circle arc                               */
/* ------------------------------------------------------------------ */

const GAUGE_RADIUS = 42;
const GAUGE_CIRCUMFERENCE = Math.PI * GAUGE_RADIUS;
const GAUGE_VIEWBOX = "0 0 100 55";
const GAUGE_CX = 50;
const GAUGE_CY = 50;
const GAUGE_STROKE_WIDTH = 8;

/* ------------------------------------------------------------------ */
/* Icons — inline SVGs for each rating                                 */
/* ------------------------------------------------------------------ */

/** Checkmark icon for "good" rating. */
function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4ade80"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="metric-icon-good"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Warning triangle icon for "needs-improvement" rating. */
function WarningIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#facc15"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="metric-icon-warning"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

/** Alert circle icon for "poor" rating. */
function AlertIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f87171"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="metric-icon-poor"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

/** Resolve the correct icon for a rating. */
function RatingIcon({ rating }: { rating: MetricRating }) {
  switch (rating) {
    case "good":
      return <CheckIcon />;
    case "needs-improvement":
      return <WarningIcon />;
    case "poor":
      return <AlertIcon />;
  }
}

/* ------------------------------------------------------------------ */
/* Easing — PrefPilot standard from ADR-025                            */
/* ------------------------------------------------------------------ */

const PREFPILOT_EASING: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ------------------------------------------------------------------ */
/* AnimatedScore — counts up from 0 to score                           */
/* ------------------------------------------------------------------ */

function AnimatedScore({ score, reduced }: { score: number; reduced: boolean }) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) => Math.round(v));
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) {
      motionVal.set(score);
      /* v8 ignore next 2 -- displayRef may be null in test environment */
      if (displayRef.current !== null) {
        displayRef.current.textContent = String(score);
      }
      return;
    }

    const controls = animate(motionVal, score, {
      duration: 1,
      ease: PREFPILOT_EASING,
    });

    const unsubscribe = rounded.on("change", (v) => {
      /* v8 ignore next 3 -- displayRef may be null in test environment; callback invoked by framer-motion runtime */
      if (displayRef.current !== null) {
        displayRef.current.textContent = String(v);
      }
    });

    return () => {
      /* v8 ignore next 2 -- controls may lack stop() in test environment */
      if (typeof controls?.stop === "function") {
        controls.stop();
      }
      unsubscribe();
    };
  }, [score, reduced, motionVal, rounded]);

  return (
    <span
      ref={displayRef}
      data-testid="metric-score"
      className="text-2xl font-bold text-neutral-50"
      aria-hidden="true"
    >
      {score}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* MetricCard component                                                */
/* ------------------------------------------------------------------ */

export function MetricCard({ label, score, displayValue, rating, description }: MetricCardProps) {
  /* v8 ignore next -- useReducedMotion returns boolean|null; null fallback is defensive */
  const prefersReduced = useReducedMotion() ?? false;

  const normalizedScore = Math.max(0, Math.min(100, score));
  const strokeFraction = normalizedScore / 100;

  return (
    <div
      data-testid={`metric-card-${label.toLowerCase()}`}
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
      aria-label={`${label} score: ${normalizedScore} out of 100, rated ${rating}`}
    >
      {/* Header — label + rating badge */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-neutral-50">{label}</h3>
        <Badge label={RATING_LABEL[rating]} variant={RATING_BADGE_VARIANT[rating]} />
      </div>

      {/* SVG half-circle gauge — strokeDashoffset animation (21st.dev pattern) */}
      {/* The arc starts at bottom-left, sweeps clockwise to bottom-right */}
      <div className="relative flex flex-col items-center">
        <svg
          viewBox={GAUGE_VIEWBOX}
          className="w-full max-w-[160px]"
          aria-hidden="true"
          data-testid="metric-gauge"
        >
          <g fill="none" strokeWidth={GAUGE_STROKE_WIDTH} strokeLinecap="round">
            {/* Background arc — full half-circle in neutral-800 */}
            <circle
              cx={GAUGE_CX}
              cy={GAUGE_CY}
              r={GAUGE_RADIUS}
              stroke="#262626"
              strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE * 2}`}
              transform={`rotate(180 ${GAUGE_CX} ${GAUGE_CY})`}
            />

            {/* Foreground arc — fills left-to-right proportionally to score */}
            {/* empty = strokeDashoffset equals half-circumference (arc hidden) */}
            {/* full  = strokeDashoffset equals 0 (full half-circle visible) */}
            <motion.circle
              cx={GAUGE_CX}
              cy={GAUGE_CY}
              r={GAUGE_RADIUS}
              stroke={RATING_STROKE[rating]}
              strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE * 2}`}
              transform={`rotate(180 ${GAUGE_CX} ${GAUGE_CY})`}
              initial={{ strokeDashoffset: GAUGE_CIRCUMFERENCE }}
              animate={{
                strokeDashoffset: GAUGE_CIRCUMFERENCE * (1 - strokeFraction),
              }}
              transition={
                /* v8 ignore next 2 -- animation timing branch only evaluated by framer-motion runtime */
                prefersReduced ? { duration: 0.01 } : { duration: 1.2, ease: PREFPILOT_EASING }
              }
              data-testid="metric-gauge-fill"
            />
          </g>
        </svg>

        {/* Icon + score overlay — centered inside the gauge arc */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-1">
          <RatingIcon rating={rating} />
          <AnimatedScore score={normalizedScore} reduced={prefersReduced} />
        </div>
      </div>

      {/* Display value — the formatted metric value */}
      <p data-testid="metric-display-value" className="text-center text-sm text-neutral-400 mt-2">
        {displayValue}
      </p>

      {/* Description — optional full metric name */}
      {description !== undefined && description !== "" && (
        <p data-testid="metric-description" className="text-center text-xs text-neutral-500 mt-1">
          {description}
        </p>
      )}
    </div>
  );
}
