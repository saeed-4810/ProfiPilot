import { Skeleton } from "@/components/ui/Skeleton";

/* ------------------------------------------------------------------ */
/* ProjectCardSkeleton                                                 */
/* ------------------------------------------------------------------ */

/**
 * Contextual skeleton matching the dashboard project card shape.
 *
 * Layout mirrors the project card in dashboard/page.tsx:
 * - Header: globe icon (circular) + project name + URL subtitle
 * - Health metrics: 3 mini metric cards in a row
 * - Footer: audit status + created date
 *
 * Uses the shared Skeleton component (shimmer animation).
 * Scenarios: U-PERF-160-003
 */
export function ProjectCardSkeleton() {
  return (
    <div
      data-testid="project-card-skeleton"
      className="rounded-2xl border border-neutral-800/50 bg-neutral-900/80 p-6"
      role="status"
      aria-label="Loading project card"
    >
      {/* Header — globe icon + name + status dot */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton width="32px" height="32px" variant="circular" />
          <div>
            <Skeleton width="120px" height="20px" variant="text" className="mb-1" />
            <Skeleton width="160px" height="12px" variant="text" />
          </div>
        </div>
        <Skeleton width="56px" height="16px" variant="text" />
      </div>

      {/* Health metrics — 3 mini metric cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <Skeleton width="24px" height="10px" variant="text" className="mb-1" />
            <Skeleton width="48px" height="16px" variant="text" className="mb-0.5" />
            <Skeleton width="32px" height="10px" variant="text" />
          </div>
        ))}
      </div>

      {/* Footer — audit status + created date */}
      <div className="flex items-center justify-between">
        <Skeleton width="120px" height="12px" variant="text" />
        <Skeleton width="100px" height="12px" variant="text" />
      </div>
    </div>
  );
}
