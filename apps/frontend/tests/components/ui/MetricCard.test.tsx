import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mock framer-motion                                                  */
/* ------------------------------------------------------------------ */

const mockUseReducedMotion = vi.fn<[], boolean>().mockReturnValue(false);
const mockAnimate = vi.fn().mockReturnValue({ stop: vi.fn() });
const mockMotionValue = {
  set: vi.fn(),
  get: vi.fn().mockReturnValue(0),
  on: vi.fn().mockReturnValue(vi.fn()),
};
const mockUseMotionValue = vi.fn().mockReturnValue(mockMotionValue);
const mockUseTransform = vi.fn().mockImplementation((_mv, fn: (v: number) => number) => ({
  ...mockMotionValue,
  get: () => fn(mockMotionValue.get()),
  on: vi.fn().mockReturnValue(vi.fn()),
}));

/**
 * Passthrough mock for framer-motion — renders DOM elements with data-testid
 * and className preserved, strips animation-specific props.
 */
function mockMotionComponent(Tag: string) {
  return function MotionMock({ children, ...props }: Record<string, unknown>) {
    const domProps: Record<string, unknown> = {};
    const domSafeKeys = [
      "className",
      "data-testid",
      "role",
      "aria-label",
      "aria-hidden",
      "style",
      "width",
      "height",
      "viewBox",
      "fill",
      "stroke",
      "strokeWidth",
      "strokeLinecap",
      "strokeLinejoin",
      "d",
      "cx",
      "cy",
      "r",
      "opacity",
      "pathLength",
      "strokeDasharray",
      "strokeDashoffset",
      "transform",
    ];
    for (const key of Object.keys(props)) {
      if (domSafeKeys.includes(key) || key.startsWith("data-") || key.startsWith("aria-")) {
        domProps[key] = props[key];
      }
    }
    const El = Tag as unknown as React.ElementType;
    return <El {...domProps}>{children as React.ReactNode}</El>;
  };
}

vi.mock("framer-motion", () => ({
  motion: {
    div: mockMotionComponent("div"),
    circle: mockMotionComponent("circle"),
    path: mockMotionComponent("path"),
    svg: mockMotionComponent("svg"),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => mockUseReducedMotion(),
  useMotionValue: (initial: number) => mockUseMotionValue(initial),
  useTransform: (_mv: unknown, fn: (v: number) => number) => mockUseTransform(_mv, fn),
  animate: (...args: unknown[]) => mockAnimate(...args),
}));

import { MetricCard } from "../../../components/ui/MetricCard";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseReducedMotion.mockReturnValue(false);
});

/* ================================================================== */
/* T-PERF-143-001: MetricCard renders all 3 rating states             */
/* ================================================================== */

describe("T-PERF-143-001: MetricCard renders all 3 rating states", () => {
  it("renders good rating with green stroke and checkmark icon", () => {
    render(<MetricCard label="CLS" score={92} displayValue="0.05" rating="good" />);

    const card = screen.getByTestId("metric-card-cls");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-label", "CLS score: 92 out of 100, rated good");

    // Good rating icon
    expect(screen.getByTestId("metric-icon-good")).toBeInTheDocument();

    // Gauge fill has green stroke
    const gaugeFill = screen.getByTestId("metric-gauge-fill");
    expect(gaugeFill).toHaveAttribute("stroke", "#4ade80");
  });

  it("renders needs-improvement rating with yellow stroke and warning icon", () => {
    render(<MetricCard label="LCP" score={55} displayValue="2.8s" rating="needs-improvement" />);

    const card = screen.getByTestId("metric-card-lcp");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-label", "LCP score: 55 out of 100, rated needs-improvement");

    // Warning icon
    expect(screen.getByTestId("metric-icon-warning")).toBeInTheDocument();

    // Gauge fill has yellow stroke
    const gaugeFill = screen.getByTestId("metric-gauge-fill");
    expect(gaugeFill).toHaveAttribute("stroke", "#facc15");
  });

  it("renders poor rating with red stroke and alert icon", () => {
    render(<MetricCard label="TBT" score={15} displayValue="850ms" rating="poor" />);

    const card = screen.getByTestId("metric-card-tbt");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-label", "TBT score: 15 out of 100, rated poor");

    // Alert icon
    expect(screen.getByTestId("metric-icon-poor")).toBeInTheDocument();

    // Gauge fill has red stroke
    const gaugeFill = screen.getByTestId("metric-gauge-fill");
    expect(gaugeFill).toHaveAttribute("stroke", "#f87171");
  });
});

/* ================================================================== */
/* Score display                                                       */
/* ================================================================== */

describe("MetricCard score display", () => {
  it("shows the displayValue text", () => {
    render(<MetricCard label="LCP" score={45} displayValue="3.2s" rating="poor" />);

    expect(screen.getByTestId("metric-display-value")).toHaveTextContent("3.2s");
  });

  it("shows the score number", () => {
    render(<MetricCard label="CLS" score={88} displayValue="0.02" rating="good" />);

    expect(screen.getByTestId("metric-score")).toHaveTextContent("88");
  });
});

/* ================================================================== */
/* Rating badge                                                        */
/* ================================================================== */

describe("MetricCard rating badge", () => {
  it("shows Good badge for good rating", () => {
    render(<MetricCard label="CLS" score={95} displayValue="0.01" rating="good" />);

    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows Needs Improvement badge for needs-improvement rating", () => {
    render(<MetricCard label="LCP" score={50} displayValue="2.9s" rating="needs-improvement" />);

    expect(screen.getByText("Needs Improvement")).toBeInTheDocument();
  });

  it("shows Poor badge for poor rating", () => {
    render(<MetricCard label="TBT" score={10} displayValue="1200ms" rating="poor" />);

    expect(screen.getByText("Poor")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* Reduced motion                                                      */
/* ================================================================== */

describe("MetricCard reduced motion", () => {
  it("sets motionValue directly when reduced motion is preferred", () => {
    mockUseReducedMotion.mockReturnValue(true);

    render(<MetricCard label="LCP" score={60} displayValue="2.5s" rating="needs-improvement" />);

    // When reduced motion, motionValue.set is called directly with the score
    expect(mockMotionValue.set).toHaveBeenCalledWith(60);
    // animate should NOT be called
    expect(mockAnimate).not.toHaveBeenCalled();
  });

  it("calls animate when motion is allowed", () => {
    mockUseReducedMotion.mockReturnValue(false);

    render(<MetricCard label="CLS" score={85} displayValue="0.03" rating="good" />);

    // animate should be called with the motionValue and score
    expect(mockAnimate).toHaveBeenCalled();
  });
});

/* ================================================================== */
/* Description                                                         */
/* ================================================================== */

describe("MetricCard description", () => {
  it("renders description when provided", () => {
    render(
      <MetricCard
        label="LCP"
        score={45}
        displayValue="3.2s"
        rating="poor"
        description="Largest Contentful Paint"
      />
    );

    expect(screen.getByTestId("metric-description")).toHaveTextContent("Largest Contentful Paint");
  });

  it("does not render description when not provided", () => {
    render(<MetricCard label="CLS" score={90} displayValue="0.02" rating="good" />);

    expect(screen.queryByTestId("metric-description")).not.toBeInTheDocument();
  });

  it("does not render description when empty string", () => {
    render(<MetricCard label="CLS" score={90} displayValue="0.02" rating="good" description="" />);

    expect(screen.queryByTestId("metric-description")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* Gauge SVG                                                           */
/* ================================================================== */

describe("MetricCard gauge", () => {
  it("renders gauge SVG element", () => {
    render(<MetricCard label="LCP" score={50} displayValue="2.5s" rating="needs-improvement" />);

    expect(screen.getByTestId("metric-gauge")).toBeInTheDocument();
  });

  it("has aria-hidden on gauge SVG", () => {
    render(<MetricCard label="LCP" score={50} displayValue="2.5s" rating="needs-improvement" />);

    expect(screen.getByTestId("metric-gauge")).toHaveAttribute("aria-hidden", "true");
  });
});

/* ================================================================== */
/* Card styling                                                        */
/* ================================================================== */

describe("MetricCard styling", () => {
  it("has dark theme card classes", () => {
    render(<MetricCard label="CLS" score={80} displayValue="0.08" rating="good" />);

    const card = screen.getByTestId("metric-card-cls");
    expect(card.className).toContain("rounded-xl");
    expect(card.className).toContain("border-neutral-800");
    expect(card.className).toContain("bg-neutral-900");
  });

  it("label is rendered as h3", () => {
    render(<MetricCard label="TBT" score={30} displayValue="500ms" rating="poor" />);

    const heading = screen.getByText("TBT");
    expect(heading.tagName).toBe("H3");
  });
});

/* ================================================================== */
/* Score clamping                                                      */
/* ================================================================== */

describe("MetricCard score clamping", () => {
  it("clamps score above 100 to 100", () => {
    render(<MetricCard label="CLS" score={150} displayValue="0.01" rating="good" />);

    expect(screen.getByTestId("metric-card-cls")).toHaveAttribute(
      "aria-label",
      "CLS score: 100 out of 100, rated good"
    );
  });

  it("clamps score below 0 to 0", () => {
    render(<MetricCard label="TBT" score={-10} displayValue="2000ms" rating="poor" />);

    expect(screen.getByTestId("metric-card-tbt")).toHaveAttribute(
      "aria-label",
      "TBT score: 0 out of 100, rated poor"
    );
  });
});
