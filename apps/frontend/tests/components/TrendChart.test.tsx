import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart } from "../../components/ui/TrendChart";
import type { CruxPeriod, LabDataPoint } from "../../lib/project-detail";

/* ------------------------------------------------------------------ */
/* Test data                                                           */
/* ------------------------------------------------------------------ */

const CRUX_PERIODS: CruxPeriod[] = [
  { startDate: "2026-02-23", endDate: "2026-03-01", lcpP75: 2500, clsP75: 0.1, inpP75: 200 },
  { startDate: "2026-03-02", endDate: "2026-03-08", lcpP75: 2400, clsP75: 0.09, inpP75: 180 },
  { startDate: "2026-03-09", endDate: "2026-03-15", lcpP75: 2300, clsP75: 0.08, inpP75: 170 },
];

const LAB_DATA_POINTS: LabDataPoint[] = [
  { date: "2026-03-20T10:00:00Z", lcp: 2400, cls: 0.08, tbt: 150, performanceScore: 0.85 },
  { date: "2026-03-25T10:00:00Z", lcp: 2200, cls: 0.06, tbt: 120, performanceScore: 0.92 },
];

/* ------------------------------------------------------------------ */
/* T-PERF-167-002: Trend chart renders SVG paths                       */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-002: TrendChart", () => {
  it("renders SVG with CrUX trend lines when cruxAvailable=true", () => {
    render(<TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={[]} />);

    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart-svg")).toBeInTheDocument();
    expect(screen.getByTestId("trend-line-lcp")).toBeInTheDocument();
    expect(screen.getByTestId("trend-line-cls")).toBeInTheDocument();
    expect(screen.getByTestId("trend-line-inp")).toBeInTheDocument();
  });

  it("renders LCP, CLS, INP polylines with correct stroke colors", () => {
    render(<TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={[]} />);

    const lcpLine = screen.getByTestId("trend-line-lcp");
    const clsLine = screen.getByTestId("trend-line-cls");
    const inpLine = screen.getByTestId("trend-line-inp");

    expect(lcpLine.getAttribute("stroke")).toBe("#4ae176");
    expect(clsLine.getAttribute("stroke")).toBe("#ffb95f");
    expect(inpLine.getAttribute("stroke")).toBe("#adc6ff");
  });

  it("renders lab data dots as circle markers", () => {
    render(
      <TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={LAB_DATA_POINTS} />
    );

    const dots = screen.getAllByTestId("lab-data-dot");
    expect(dots).toHaveLength(2);
  });

  it("renders legend with field and lab data labels", () => {
    render(
      <TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={LAB_DATA_POINTS} />
    );

    const legend = screen.getByTestId("trend-chart-legend");
    expect(legend).toHaveTextContent("LCP");
    expect(legend).toHaveTextContent("CLS");
    expect(legend).toHaveTextContent("INP");
    expect(legend).toHaveTextContent("Field data (real users)");
    expect(legend).toHaveTextContent("Lab data (Lighthouse)");
  });

  it("has accessible SVG with role=img and aria-label", () => {
    render(<TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={[]} />);

    const svg = screen.getByTestId("trend-chart-svg");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label");
  });

  it("includes motion-reduce classes on polylines", () => {
    render(<TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={[]} />);

    const lcpLine = screen.getByTestId("trend-line-lcp");
    expect(lcpLine.getAttribute("class")).toContain("motion-reduce:transition-none");
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-006: CrUX-unavailable state                              */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-006: TrendChart CrUX-unavailable", () => {
  it("shows no-CrUX message when cruxAvailable=false with lab data", () => {
    render(<TrendChart cruxAvailable={false} cruxPeriods={[]} labDataPoints={LAB_DATA_POINTS} />);

    expect(screen.getByTestId("trend-chart-no-crux")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart-no-crux")).toHaveTextContent("real-user traffic");
    // Lab dots should still render
    expect(screen.getAllByTestId("lab-data-dot")).toHaveLength(2);
  });

  it("shows empty state when no CrUX and no lab data", () => {
    render(<TrendChart cruxAvailable={false} cruxPeriods={[]} labDataPoints={[]} />);

    expect(screen.getByTestId("trend-chart-empty")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart-empty")).toHaveTextContent("real-user traffic");
  });

  it("does not render CrUX polylines when cruxAvailable=false", () => {
    render(<TrendChart cruxAvailable={false} cruxPeriods={[]} labDataPoints={LAB_DATA_POINTS} />);

    expect(screen.queryByTestId("trend-line-lcp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trend-line-cls")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trend-line-inp")).not.toBeInTheDocument();
  });

  it("renders lab-only legend when no CrUX data", () => {
    render(<TrendChart cruxAvailable={false} cruxPeriods={[]} labDataPoints={LAB_DATA_POINTS} />);

    const legend = screen.getByTestId("trend-chart-legend");
    expect(legend).toHaveTextContent("Lab data (Lighthouse)");
    expect(legend).not.toHaveTextContent("Field data (real users)");
  });
});

/* ------------------------------------------------------------------ */
/* Edge cases                                                          */
/* ------------------------------------------------------------------ */

describe("TrendChart edge cases", () => {
  it("handles CrUX periods with null metric values", () => {
    const periodsWithNulls: CruxPeriod[] = [
      { startDate: "2026-03-01", endDate: "2026-03-07", lcpP75: null, clsP75: null, inpP75: null },
      { startDate: "2026-03-08", endDate: "2026-03-14", lcpP75: 2500, clsP75: 0.1, inpP75: 200 },
    ];

    render(<TrendChart cruxAvailable={true} cruxPeriods={periodsWithNulls} labDataPoints={[]} />);

    // Should render without crashing — polylines may have fewer points
    expect(screen.getByTestId("trend-chart-svg")).toBeInTheDocument();
  });

  it("handles lab data points with null performanceScore", () => {
    const labWithNulls: LabDataPoint[] = [
      { date: "2026-03-20T10:00:00Z", lcp: 2400, cls: 0.08, tbt: 150, performanceScore: null },
    ];

    render(<TrendChart cruxAvailable={false} cruxPeriods={[]} labDataPoints={labWithNulls} />);

    // Null score dots should not render
    expect(screen.queryByTestId("lab-data-dot")).not.toBeInTheDocument();
  });

  it("renders chart grid", () => {
    render(<TrendChart cruxAvailable={true} cruxPeriods={CRUX_PERIODS} labDataPoints={[]} />);

    expect(screen.getByTestId("chart-grid")).toBeInTheDocument();
  });
});
