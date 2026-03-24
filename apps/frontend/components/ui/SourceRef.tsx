"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SourceRefProps {
  /** Metric key, e.g. "LCP", "CLS", "TBT". */
  metric: string;
  /** Formatted display value, e.g. "3.2s", "0.05". */
  value: string;
  /** Full metric name, e.g. "Largest Contentful Paint". */
  fullName: string;
  /** CWV threshold, e.g. "2.5s". */
  threshold: string;
  /** Rating bucket, e.g. "Poor", "Good". */
  rating: string;
  /** Delta from threshold, e.g. "+0.7s". */
  delta: string;
}

/* ------------------------------------------------------------------ */
/* Rating → color mapping                                              */
/* ------------------------------------------------------------------ */

function ratingColor(rating: string): string {
  const lower = rating.toLowerCase();
  if (lower === "poor") return "text-red-400";
  if (lower === "needs improvement") return "text-yellow-400";
  return "text-green-400";
}

/* ------------------------------------------------------------------ */
/* SourceRef component                                                 */
/* ------------------------------------------------------------------ */

/**
 * Inline source metric reference for AI summaries (PERF-148).
 *
 * Renders as a small interactive pill `[LCP: 3.2s]` that expands on click
 * to show the full metric name, threshold, rating, and delta.
 *
 * - Keyboard accessible: Enter/Space toggles, Escape closes.
 * - aria-expanded + aria-describedby for screen readers.
 * - prefers-reduced-motion: instant opacity transition (no height animation).
 * - Tailwind-only styling, ADR-025 dark palette.
 */
export function SourceRef({ metric, value, fullName, threshold, rating, delta }: SourceRefProps) {
  const [expanded, setExpanded] = useState(false);
  /* v8 ignore next -- useReducedMotion returns boolean|null; null fallback is defensive */
  const prefersReduced = useReducedMotion() ?? false;
  const panelId = `source-ref-panel-${metric}`;
  const containerRef = useRef<HTMLSpanElement>(null);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && expanded) {
        e.preventDefault();
        setExpanded(false);
      }
    },
    [expanded, toggle]
  );

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;

    /* v8 ignore next 6 -- outside click handler: DOM event, containerRef may be null in jsdom */
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current === null) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded]);

  const hasDetail = threshold !== "" || rating !== "" || delta !== "";

  return (
    <span ref={containerRef} className="relative inline" data-testid={`source-ref-${metric}`}>
      {/* Inline pill trigger */}
      <button
        type="button"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        aria-expanded={expanded}
        aria-describedby={expanded ? panelId : undefined}
        data-testid={`source-ref-trigger-${metric}`}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-pointer transition-colors hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      >
        {metric}: {value}
        {hasDetail && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Expandable detail panel */}
      <AnimatePresence initial={false}>
        {expanded && hasDetail && (
          <motion.span
            id={panelId}
            data-testid={`source-ref-panel-${metric}`}
            role="region"
            aria-label={`${fullName} details`}
            className="absolute left-0 top-full z-10 mt-1 block w-64 rounded-lg border border-neutral-700 bg-neutral-800 p-3 shadow-lg"
            /* v8 ignore next 4 -- reduced motion branches: only evaluated by framer-motion runtime */
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={prefersReduced ? { duration: 0.01 } : { duration: 0.2 }}
          >
            {/* Full metric name */}
            <span className="block text-xs font-medium text-neutral-200 mb-2">{fullName}</span>

            {/* Data grid */}
            <span className="grid grid-cols-2 gap-x-4 gap-y-1">
              {threshold !== "" && (
                <>
                  <span className="text-[10px] text-neutral-500">Threshold</span>
                  <span className="text-[10px] text-neutral-300 text-right">{threshold}</span>
                </>
              )}
              <span className="text-[10px] text-neutral-500">Current</span>
              <span className="text-[10px] text-neutral-300 text-right">{value}</span>
              {rating !== "" && (
                <>
                  <span className="text-[10px] text-neutral-500">Rating</span>
                  <span className={`text-[10px] text-right ${ratingColor(rating)}`}>{rating}</span>
                </>
              )}
              {delta !== "" && (
                <>
                  <span className="text-[10px] text-neutral-500">Delta</span>
                  <span className="text-[10px] text-neutral-300 text-right">{delta}</span>
                </>
              )}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
