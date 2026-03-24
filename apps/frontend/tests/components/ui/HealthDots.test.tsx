import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HealthDots } from "../../../components/ui/HealthDots";

/* ================================================================== */
/* HealthDots — status dot colors                                      */
/* ================================================================== */

describe("HealthDots status colors", () => {
  it("renders green dots for good status", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    const lcpDot = screen.getByTestId("health-dot-lcp");
    const clsDot = screen.getByTestId("health-dot-cls");
    const tbtDot = screen.getByTestId("health-dot-tbt");
    expect(lcpDot.className).toContain("bg-green-400");
    expect(clsDot.className).toContain("bg-green-400");
    expect(tbtDot.className).toContain("bg-green-400");
  });

  it("renders yellow dots for needs-improvement status", () => {
    render(<HealthDots lcp="needs-improvement" cls="needs-improvement" tbt="needs-improvement" />);
    const lcpDot = screen.getByTestId("health-dot-lcp");
    const clsDot = screen.getByTestId("health-dot-cls");
    const tbtDot = screen.getByTestId("health-dot-tbt");
    expect(lcpDot.className).toContain("bg-yellow-400");
    expect(clsDot.className).toContain("bg-yellow-400");
    expect(tbtDot.className).toContain("bg-yellow-400");
  });

  it("renders red dots for poor status", () => {
    render(<HealthDots lcp="poor" cls="poor" tbt="poor" />);
    const lcpDot = screen.getByTestId("health-dot-lcp");
    const clsDot = screen.getByTestId("health-dot-cls");
    const tbtDot = screen.getByTestId("health-dot-tbt");
    expect(lcpDot.className).toContain("bg-red-400");
    expect(clsDot.className).toContain("bg-red-400");
    expect(tbtDot.className).toContain("bg-red-400");
  });

  it("renders neutral dots for unknown status when showLabel is false", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" showLabel={false} />);
    const lcpDot = screen.getByTestId("health-dot-lcp");
    const clsDot = screen.getByTestId("health-dot-cls");
    const tbtDot = screen.getByTestId("health-dot-tbt");
    expect(lcpDot.className).toContain("bg-neutral-600");
    expect(clsDot.className).toContain("bg-neutral-600");
    expect(tbtDot.className).toContain("bg-neutral-600");
  });

  it("renders mixed status colors correctly", () => {
    render(<HealthDots lcp="good" cls="needs-improvement" tbt="poor" />);
    expect(screen.getByTestId("health-dot-lcp").className).toContain("bg-green-400");
    expect(screen.getByTestId("health-dot-cls").className).toContain("bg-yellow-400");
    expect(screen.getByTestId("health-dot-tbt").className).toContain("bg-red-400");
  });
});

/* ================================================================== */
/* HealthDots — all-unknown shows "No audits yet"                      */
/* ================================================================== */

describe("HealthDots all-unknown state", () => {
  it("shows 'No audits yet' text when all statuses are unknown", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" />);
    expect(screen.getByText("No audits yet")).toBeInTheDocument();
    expect(screen.queryByTestId("health-dot-lcp")).not.toBeInTheDocument();
  });

  it("shows 'No audits yet' text when all unknown and showLabel is true", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" showLabel={true} />);
    expect(screen.getByText("No audits yet")).toBeInTheDocument();
  });

  it("shows dots instead of text when showLabel is false even if all unknown", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" showLabel={false} />);
    expect(screen.queryByText("No audits yet")).not.toBeInTheDocument();
    expect(screen.getByTestId("health-dot-lcp")).toBeInTheDocument();
    expect(screen.getByTestId("health-dot-cls")).toBeInTheDocument();
    expect(screen.getByTestId("health-dot-tbt")).toBeInTheDocument();
  });

  it("shows dots when only some statuses are unknown", () => {
    render(<HealthDots lcp="good" cls="unknown" tbt="unknown" />);
    expect(screen.queryByText("No audits yet")).not.toBeInTheDocument();
    expect(screen.getByTestId("health-dot-lcp")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* HealthDots — aria-labels                                            */
/* ================================================================== */

describe("HealthDots aria-labels", () => {
  it("has correct aria-label for good status", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    expect(screen.getByTestId("health-dot-lcp")).toHaveAttribute("aria-label", "LCP: Good");
    expect(screen.getByTestId("health-dot-cls")).toHaveAttribute("aria-label", "CLS: Good");
    expect(screen.getByTestId("health-dot-tbt")).toHaveAttribute("aria-label", "TBT: Good");
  });

  it("has correct aria-label for needs-improvement status", () => {
    render(<HealthDots lcp="needs-improvement" cls="needs-improvement" tbt="needs-improvement" />);
    expect(screen.getByTestId("health-dot-lcp")).toHaveAttribute(
      "aria-label",
      "LCP: Needs Improvement"
    );
    expect(screen.getByTestId("health-dot-cls")).toHaveAttribute(
      "aria-label",
      "CLS: Needs Improvement"
    );
    expect(screen.getByTestId("health-dot-tbt")).toHaveAttribute(
      "aria-label",
      "TBT: Needs Improvement"
    );
  });

  it("has correct aria-label for poor status", () => {
    render(<HealthDots lcp="poor" cls="poor" tbt="poor" />);
    expect(screen.getByTestId("health-dot-lcp")).toHaveAttribute("aria-label", "LCP: Poor");
    expect(screen.getByTestId("health-dot-cls")).toHaveAttribute("aria-label", "CLS: Poor");
    expect(screen.getByTestId("health-dot-tbt")).toHaveAttribute("aria-label", "TBT: Poor");
  });

  it("has correct aria-label for unknown status", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" showLabel={false} />);
    expect(screen.getByTestId("health-dot-lcp")).toHaveAttribute("aria-label", "LCP: Unknown");
    expect(screen.getByTestId("health-dot-cls")).toHaveAttribute("aria-label", "CLS: Unknown");
    expect(screen.getByTestId("health-dot-tbt")).toHaveAttribute("aria-label", "TBT: Unknown");
  });
});

/* ================================================================== */
/* HealthDots — data-testid                                            */
/* ================================================================== */

describe("HealthDots data-testid", () => {
  it("has data-testid='health-dots' on the container when showing dots", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    expect(screen.getByTestId("health-dots")).toBeInTheDocument();
  });

  it("has data-testid='health-dots' on the container when showing 'No audits yet'", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" />);
    expect(screen.getByTestId("health-dots")).toBeInTheDocument();
  });

  it("has individual dot test ids", () => {
    render(<HealthDots lcp="good" cls="poor" tbt="needs-improvement" />);
    expect(screen.getByTestId("health-dot-lcp")).toBeInTheDocument();
    expect(screen.getByTestId("health-dot-cls")).toBeInTheDocument();
    expect(screen.getByTestId("health-dot-tbt")).toBeInTheDocument();
  });

  it("has individual metric card test ids", () => {
    render(<HealthDots lcp="good" cls="poor" tbt="needs-improvement" />);
    expect(screen.getByTestId("health-metric-lcp")).toBeInTheDocument();
    expect(screen.getByTestId("health-metric-cls")).toBeInTheDocument();
    expect(screen.getByTestId("health-metric-tbt")).toBeInTheDocument();
  });

  it("has individual rating test ids", () => {
    render(<HealthDots lcp="good" cls="poor" tbt="needs-improvement" />);
    expect(screen.getByTestId("health-rating-lcp")).toBeInTheDocument();
    expect(screen.getByTestId("health-rating-cls")).toBeInTheDocument();
    expect(screen.getByTestId("health-rating-tbt")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* HealthDots — metric labels                                          */
/* ================================================================== */

describe("HealthDots metric labels", () => {
  it("renders LCP, CLS, TBT labels in metric cards", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    expect(screen.getByText("LCP")).toBeInTheDocument();
    expect(screen.getByText("CLS")).toBeInTheDocument();
    expect(screen.getByText("TBT")).toBeInTheDocument();
  });

  it("does not render metric labels when showing 'No audits yet'", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" />);
    expect(screen.queryByText("LCP")).not.toBeInTheDocument();
    expect(screen.queryByText("CLS")).not.toBeInTheDocument();
    expect(screen.queryByText("TBT")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* HealthDots — dot sizing                                             */
/* ================================================================== */

describe("HealthDots dot sizing", () => {
  it("dots have 8x8px size classes (h-2 w-2)", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    const dot = screen.getByTestId("health-dot-lcp");
    expect(dot.className).toContain("h-2");
    expect(dot.className).toContain("w-2");
  });

  it("dots are rounded-full", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    const dot = screen.getByTestId("health-dot-lcp");
    expect(dot.className).toContain("rounded-full");
  });
});

/* ================================================================== */
/* HealthDots — display values                                         */
/* ================================================================== */

describe("HealthDots display values", () => {
  it("renders formatted metric values when provided", () => {
    render(
      <HealthDots
        lcp="good"
        cls="good"
        tbt="good"
        lcpValue="2.1s"
        clsValue="0.05"
        tbtValue="150ms"
      />
    );
    expect(screen.getByText("2.1s")).toBeInTheDocument();
    expect(screen.getByText("0.05")).toBeInTheDocument();
    expect(screen.getByText("150ms")).toBeInTheDocument();
  });

  it("renders em dash when no values are provided", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    // All three metric cards should show em dash (\u2014)
    const emDashes = screen.getAllByText("\u2014");
    expect(emDashes).toHaveLength(3);
  });

  it("renders partial values — some provided, some missing", () => {
    render(<HealthDots lcp="good" cls="poor" tbt="unknown" lcpValue="1.5s" showLabel={false} />);
    expect(screen.getByText("1.5s")).toBeInTheDocument();
    // CLS and TBT should show em dash
    const emDashes = screen.getAllByText("\u2014");
    expect(emDashes).toHaveLength(2);
  });
});

/* ================================================================== */
/* HealthDots — rating labels                                          */
/* ================================================================== */

describe("HealthDots rating labels", () => {
  it("renders 'Good' rating for good status", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    const ratings = screen.getAllByText("Good");
    expect(ratings).toHaveLength(3);
  });

  it("renders 'Needs Improvement' rating for needs-improvement status", () => {
    render(<HealthDots lcp="needs-improvement" cls="needs-improvement" tbt="needs-improvement" />);
    const ratings = screen.getAllByText("Needs Improvement");
    expect(ratings).toHaveLength(3);
  });

  it("renders 'Poor' rating for poor status", () => {
    render(<HealthDots lcp="poor" cls="poor" tbt="poor" />);
    const ratings = screen.getAllByText("Poor");
    expect(ratings).toHaveLength(3);
  });

  it("renders 'Unknown' rating for unknown status", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" showLabel={false} />);
    const ratings = screen.getAllByText("Unknown");
    expect(ratings).toHaveLength(3);
  });

  it("renders mixed rating labels correctly", () => {
    render(<HealthDots lcp="good" cls="needs-improvement" tbt="poor" />);
    expect(screen.getByTestId("health-rating-lcp")).toHaveTextContent("Good");
    expect(screen.getByTestId("health-rating-cls")).toHaveTextContent("Needs Improvement");
    expect(screen.getByTestId("health-rating-tbt")).toHaveTextContent("Poor");
  });
});

/* ================================================================== */
/* HealthDots — rating text colors                                     */
/* ================================================================== */

describe("HealthDots rating text colors", () => {
  it("renders green text for good rating", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    expect(screen.getByTestId("health-rating-lcp").className).toContain("text-green-400");
  });

  it("renders yellow text for needs-improvement rating", () => {
    render(<HealthDots lcp="needs-improvement" cls="needs-improvement" tbt="needs-improvement" />);
    expect(screen.getByTestId("health-rating-lcp").className).toContain("text-yellow-400");
  });

  it("renders red text for poor rating", () => {
    render(<HealthDots lcp="poor" cls="poor" tbt="poor" />);
    expect(screen.getByTestId("health-rating-lcp").className).toContain("text-red-400");
  });

  it("renders neutral text for unknown rating", () => {
    render(<HealthDots lcp="unknown" cls="unknown" tbt="unknown" showLabel={false} />);
    expect(screen.getByTestId("health-rating-lcp").className).toContain("text-neutral-500");
  });
});

/* ================================================================== */
/* HealthDots — mini metric card layout                                */
/* ================================================================== */

describe("HealthDots mini metric card layout", () => {
  it("renders metric cards with bg-neutral-800/50 background", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    const card = screen.getByTestId("health-metric-lcp");
    expect(card.className).toContain("bg-neutral-800/50");
    expect(card.className).toContain("rounded-lg");
  });

  it("renders container as a 3-column grid", () => {
    render(<HealthDots lcp="good" cls="good" tbt="good" />);
    const container = screen.getByTestId("health-dots");
    expect(container.className).toContain("grid");
    expect(container.className).toContain("grid-cols-3");
  });
});
