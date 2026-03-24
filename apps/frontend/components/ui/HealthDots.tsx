/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type HealthStatus = "good" | "needs-improvement" | "poor" | "unknown";

export interface HealthDotsProps {
  /** CWV health status for Largest Contentful Paint. */
  lcp: HealthStatus;
  /** CWV health status for Cumulative Layout Shift. */
  cls: HealthStatus;
  /** CWV health status for Total Blocking Time. */
  tbt: HealthStatus;
  /** Formatted display value for LCP (e.g. "2.1s"). */
  lcpValue?: string;
  /** Formatted display value for CLS (e.g. "0.05"). */
  clsValue?: string;
  /** Formatted display value for TBT (e.g. "150ms"). */
  tbtValue?: string;
  /** Show "No audits yet" when all statuses are unknown. */
  showLabel?: boolean;
}

/* ------------------------------------------------------------------ */
/* Style maps                                                          */
/* ------------------------------------------------------------------ */

const STATUS_DOT_COLOR: Record<HealthStatus, string> = {
  good: "bg-green-400",
  "needs-improvement": "bg-yellow-400",
  poor: "bg-red-400",
  unknown: "bg-neutral-600",
};

const STATUS_TEXT_COLOR: Record<HealthStatus, string> = {
  good: "text-green-400",
  "needs-improvement": "text-yellow-400",
  poor: "text-red-400",
  unknown: "text-neutral-500",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  good: "Good",
  "needs-improvement": "Needs Improvement",
  poor: "Poor",
  unknown: "Unknown",
};

/* ------------------------------------------------------------------ */
/* Metric definitions                                                  */
/* ------------------------------------------------------------------ */

interface MetricDef {
  key: "lcp" | "cls" | "tbt";
  label: string;
  fullName: string;
  valueKey: "lcpValue" | "clsValue" | "tbtValue";
}

const METRICS: readonly MetricDef[] = [
  { key: "lcp", label: "LCP", fullName: "LCP", valueKey: "lcpValue" },
  { key: "cls", label: "CLS", fullName: "CLS", valueKey: "clsValue" },
  { key: "tbt", label: "TBT", fullName: "TBT", valueKey: "tbtValue" },
] as const;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Mini metric cards showing CWV health (LCP, CLS, TBT).
 *
 * - 3 cards in a row with status dot, value, and rating label.
 * - Shows "No audits yet" when all statuses are unknown.
 * - Tailwind-only styling, ADR-025 dark palette.
 */
export function HealthDots({
  lcp,
  cls,
  tbt,
  lcpValue,
  clsValue,
  tbtValue,
  showLabel = true,
}: HealthDotsProps) {
  const statuses: Record<"lcp" | "cls" | "tbt", HealthStatus> = { lcp, cls, tbt };
  const values: Record<"lcpValue" | "clsValue" | "tbtValue", string | undefined> = {
    lcpValue,
    clsValue,
    tbtValue,
  };
  const allUnknown = lcp === "unknown" && cls === "unknown" && tbt === "unknown";

  if (allUnknown && showLabel) {
    return (
      <p data-testid="health-dots" className="text-xs text-neutral-500">
        No audits yet
      </p>
    );
  }

  return (
    <div data-testid="health-dots" className="grid grid-cols-3 gap-2">
      {METRICS.map((metric) => {
        const status = statuses[metric.key];
        const displayValue = values[metric.valueKey];

        return (
          <div
            key={metric.key}
            className="rounded-lg bg-neutral-800/50 px-3 py-2"
            data-testid={`health-metric-${metric.key}`}
          >
            {/* Metric label */}
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              {metric.label}
            </div>

            {/* Dot + value */}
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLOR[status]}`}
                aria-label={`${metric.fullName}: ${STATUS_LABEL[status]}`}
                data-testid={`health-dot-${metric.key}`}
              />
              <span className="text-sm font-medium text-neutral-200">
                {displayValue ?? "\u2014"}
              </span>
            </div>

            {/* Rating label */}
            <div
              className={`mt-0.5 text-[10px] ${STATUS_TEXT_COLOR[status]}`}
              data-testid={`health-rating-${metric.key}`}
            >
              {STATUS_LABEL[status]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
