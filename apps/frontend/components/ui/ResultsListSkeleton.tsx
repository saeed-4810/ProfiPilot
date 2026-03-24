import { Skeleton } from "@/components/ui/Skeleton";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ResultsListSkeletonProps {
  /** Number of skeleton recommendation cards to render. Defaults to 3. */
  count?: number;
}

/* ------------------------------------------------------------------ */
/* ResultsListSkeleton                                                 */
/* ------------------------------------------------------------------ */

/**
 * Contextual skeleton matching the results page recommendation list.
 *
 * Each card mirrors the recommendation card shape:
 * - Top accent border (colored line placeholder)
 * - Header: severity badge + metric label + category tag
 * - Body: description lines
 * - Footer: current/target value pills
 *
 * Uses the shared Skeleton component (shimmer animation).
 * Scenarios: U-PERF-160-002
 */
export function ResultsListSkeleton({ count = 3 }: ResultsListSkeletonProps) {
  return (
    <div
      data-testid="results-list-skeleton"
      className="space-y-3"
      role="status"
      aria-label="Loading recommendations"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          data-testid={`results-skeleton-card-${i}`}
          className="rounded-lg border border-neutral-800 border-t-2 border-t-neutral-700 bg-neutral-900 p-6 pt-5"
        >
          {/* Header — severity badge + metric + category tag */}
          <div className="flex items-center gap-3 mb-3">
            <Skeleton width="36px" height="22px" variant="text" />
            <Skeleton width="50%" height="16px" variant="text" className="flex-1" />
            <Skeleton width="64px" height="20px" variant="text" />
          </div>

          {/* Description lines */}
          <Skeleton width="90%" height="14px" variant="text" className="mb-2" />
          <Skeleton width="70%" height="14px" variant="text" className="mb-3" />

          {/* Current → Target pills */}
          <div className="flex items-center gap-2">
            <Skeleton width="80px" height="22px" variant="text" />
            <Skeleton width="16px" height="14px" variant="text" />
            <Skeleton width="80px" height="22px" variant="text" />
          </div>
        </div>
      ))}
    </div>
  );
}
