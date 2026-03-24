import { Skeleton } from "@/components/ui/Skeleton";

/* ------------------------------------------------------------------ */
/* MetricCardSkeleton                                                  */
/* ------------------------------------------------------------------ */

/**
 * Contextual skeleton matching the MetricCard shape.
 *
 * Layout mirrors MetricCard.tsx:
 * - Header row: label (text) + badge placeholder
 * - Center: half-circle gauge area (circular skeleton)
 * - Footer: display value text line
 *
 * Uses the shared Skeleton component (shimmer animation).
 * Scenarios: U-PERF-160-001
 */
export function MetricCardSkeleton() {
  return (
    <div
      data-testid="metric-card-skeleton"
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
      role="status"
      aria-label="Loading metric card"
    >
      {/* Header — label + badge placeholder */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton width="48px" height="16px" variant="text" />
        <Skeleton width="64px" height="22px" variant="text" />
      </div>

      {/* Gauge area — half-circle placeholder */}
      <div className="flex justify-center mb-2">
        <Skeleton width="120px" height="60px" variant="rectangular" />
      </div>

      {/* Score placeholder */}
      <div className="flex justify-center mb-2">
        <Skeleton width="40px" height="28px" variant="text" />
      </div>

      {/* Display value */}
      <div className="flex justify-center">
        <Skeleton width="56px" height="14px" variant="text" />
      </div>
    </div>
  );
}
