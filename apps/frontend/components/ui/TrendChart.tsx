"use client";

/**
 * TrendChart — SVG line chart for project performance trends (PERF-167).
 *
 * Renders CrUX weekly trend lines (field data) + lab audit dots (lab data).
 * When CrUX is unavailable, shows explanatory copy + lab-only dots.
 *
 * ADR-029 §1: Hybrid approach — CrUX History as primary, lab audits as secondary.
 * ADR-025: Tailwind-only styling, motion-reduce fallback.
 *
 * U-PERF-167-002: Color-coded lines with legend, reduced motion fallback.
 * U-PERF-167-003: CrUX-unavailable copy explains limitation clearly.
 * T-PERF-167-002: SVG paths render from CrUX periods and lab points.
 */

import type { CruxPeriod, LabDataPoint } from "@/lib/project-detail";
import { COPY_NO_CRUX, COPY_FIELD_LEGEND, COPY_LAB_LEGEND } from "@/lib/project-detail";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TrendChartProps {
  /** Whether CrUX field data is available for this project. */
  readonly cruxAvailable: boolean;
  /** Weekly CrUX data points (up to 25 periods). */
  readonly cruxPeriods: readonly CruxPeriod[];
  /** Lab audit data points (irregular timestamps). */
  readonly labDataPoints: readonly LabDataPoint[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Chart dimensions (viewBox-relative, responsive via SVG scaling). */
const CHART_WIDTH = 400;
const CHART_HEIGHT = 200;
const PADDING_X = 40;
const PADDING_Y = 20;
const PLOT_WIDTH = CHART_WIDTH - PADDING_X * 2;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING_Y * 2;

/** Metric colors matching Stitch design. */
const COLORS = {
  lcp: "#4ae176",
  cls: "#ffb95f",
  inp: "#adc6ff",
  labDot: "#a78bfa",
} as const;

/** LCP max for Y-axis scaling (ms). */
const LCP_MAX = 6000;

/** CLS max for Y-axis scaling (unitless). */
const CLS_MAX = 0.5;

/** INP max for Y-axis scaling (ms). */
const INP_MAX = 1000;

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Scale a value to chart Y coordinate (inverted — 0 is top). */
function scaleY(value: number, max: number): number {
  const clamped = Math.min(value, max);
  return PADDING_Y + PLOT_HEIGHT - (clamped / max) * PLOT_HEIGHT;
}

/** Compute X position for an index in a series of N points. */
function scaleX(index: number, total: number): number {
  if (total <= 1) return PADDING_X + PLOT_WIDTH / 2;
  return PADDING_X + (index / (total - 1)) * PLOT_WIDTH;
}

/** Build an SVG polyline points string from numeric values. */
function buildPolylinePoints(values: readonly (number | null)[], max: number): string {
  const total = values.length;
  return values
    .map((v, i) => {
      if (v === null) return null;
      return `${scaleX(i, total)},${scaleY(v, max)}`;
    })
    .filter((p): p is string => p !== null)
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

/** Grid lines for the chart background. */
function ChartGrid() {
  const lines = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g data-testid="chart-grid" aria-hidden="true">
      {lines.map((ratio) => {
        const y = PADDING_Y + PLOT_HEIGHT * (1 - ratio);
        return (
          <line
            key={ratio}
            x1={PADDING_X}
            y1={y}
            x2={CHART_WIDTH - PADDING_X}
            y2={y}
            stroke="#404040"
            strokeWidth={0.5}
            strokeDasharray="4 4"
          />
        );
      })}
    </g>
  );
}

/** Map metric color hex to Tailwind bg class. */
const COLOR_TO_BG: Record<string, string> = {
  [COLORS.lcp]: "bg-[#4ae176]",
  [COLORS.cls]: "bg-[#ffb95f]",
  [COLORS.inp]: "bg-[#adc6ff]",
  [COLORS.labDot]: "bg-[#a78bfa]",
};

/** Legend item — colored line/dot + label. */
function LegendItem({
  color,
  label,
  isDot,
}: {
  readonly color: string;
  readonly label: string;
  readonly isDot?: boolean;
}) {
  /* v8 ignore next -- fallback unreachable: LegendItem only receives COLORS constants which are all mapped */
  const bgClass = COLOR_TO_BG[color] ?? "bg-neutral-500";

  return (
    <div className="flex items-center gap-1.5">
      {isDot === true ? (
        <span className={`inline-block h-2 w-2 rounded-full ${bgClass}`} aria-hidden="true" />
      ) : (
        <span className={`inline-block h-0.5 w-4 rounded ${bgClass}`} aria-hidden="true" />
      )}
      <span className="text-[10px] text-neutral-400">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function TrendChart({ cruxAvailable, cruxPeriods, labDataPoints }: TrendChartProps) {
  const hasLabData = labDataPoints.length > 0;
  const hasCruxData = cruxAvailable && cruxPeriods.length > 0;

  /* No data at all — empty state */
  if (!hasCruxData && !hasLabData) {
    return (
      <div data-testid="trend-chart-empty" className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-400">
          {/* copy: project-overview-no-crux */}
          {COPY_NO_CRUX}
        </p>
      </div>
    );
  }

  /* Build CrUX polyline data */
  const lcpPoints = hasCruxData
    ? buildPolylinePoints(
        cruxPeriods.map((p) => p.lcpP75),
        LCP_MAX
      )
    : "";
  const clsPoints = hasCruxData
    ? buildPolylinePoints(
        cruxPeriods.map((p) => p.clsP75),
        CLS_MAX
      )
    : "";
  const inpPoints = hasCruxData
    ? buildPolylinePoints(
        cruxPeriods.map((p) => p.inpP75),
        INP_MAX
      )
    : "";

  return (
    <div data-testid="trend-chart" className="flex flex-col gap-2">
      {/* No CrUX banner */}
      {!hasCruxData && (
        <p data-testid="trend-chart-no-crux" className="text-xs text-neutral-400">
          {/* copy: project-overview-no-crux */}
          {COPY_NO_CRUX}
        </p>
      )}

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Performance trend chart showing LCP, CLS, and INP metrics over time"
        data-testid="trend-chart-svg"
      >
        <ChartGrid />

        {/* CrUX trend lines */}
        {hasCruxData && lcpPoints.length > 0 && (
          <polyline
            data-testid="trend-line-lcp"
            points={lcpPoints}
            fill="none"
            stroke={COLORS.lcp}
            strokeWidth={2}
            strokeLinejoin="round"
            className="motion-reduce:transition-none"
          />
        )}
        {hasCruxData && clsPoints.length > 0 && (
          <polyline
            data-testid="trend-line-cls"
            points={clsPoints}
            fill="none"
            stroke={COLORS.cls}
            strokeWidth={2}
            strokeLinejoin="round"
            className="motion-reduce:transition-none"
          />
        )}
        {hasCruxData && inpPoints.length > 0 && (
          <polyline
            data-testid="trend-line-inp"
            points={inpPoints}
            fill="none"
            stroke={COLORS.inp}
            strokeWidth={2}
            strokeLinejoin="round"
            className="motion-reduce:transition-none"
          />
        )}

        {/* Lab audit dots */}
        {hasLabData &&
          labDataPoints.map((point, i) => {
            if (point.performanceScore === null) return null;
            const x = scaleX(i, labDataPoints.length);
            const y = scaleY(point.performanceScore * 100, 100);
            return (
              <circle
                key={point.date}
                data-testid="lab-data-dot"
                cx={x}
                cy={y}
                r={3}
                fill={COLORS.labDot}
                className="motion-reduce:transition-none"
              />
            );
          })}
      </svg>

      {/* Legend */}
      <div data-testid="trend-chart-legend" className="flex flex-wrap gap-3">
        {hasCruxData && (
          <>
            <LegendItem color={COLORS.lcp} label="LCP" />
            <LegendItem color={COLORS.cls} label="CLS" />
            <LegendItem color={COLORS.inp} label="INP" />
            <LegendItem color={COLORS.lcp} label={COPY_FIELD_LEGEND} />
          </>
        )}
        {hasLabData && <LegendItem color={COLORS.labDot} label={COPY_LAB_LEGEND} isDot />}
      </div>
    </div>
  );
}
