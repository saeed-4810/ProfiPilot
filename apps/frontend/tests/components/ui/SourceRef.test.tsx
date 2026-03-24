import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SourceRef } from "../../../components/ui/SourceRef";

/* ------------------------------------------------------------------ */
/* Mock framer-motion                                                  */
/* ------------------------------------------------------------------ */

function mockMotionComponent(Tag: string) {
  return function MotionMock({ children, ...props }: Record<string, unknown>) {
    const domProps: Record<string, unknown> = {};
    const domSafeKeys = ["className", "style", "id", "role"];
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
    span: mockMotionComponent("span"),
    div: mockMotionComponent("div"),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

/* ------------------------------------------------------------------ */
/* Default props                                                       */
/* ------------------------------------------------------------------ */

const defaultProps = {
  metric: "LCP",
  value: "3.2s",
  fullName: "Largest Contentful Paint",
  threshold: "2.5s",
  rating: "Poor",
  delta: "+0.7s",
};

/* ================================================================== */
/* Rendering                                                           */
/* ================================================================== */

describe("SourceRef rendering", () => {
  it("renders the inline pill with metric and value", () => {
    render(<SourceRef {...defaultProps} />);
    expect(screen.getByTestId("source-ref-trigger-LCP")).toHaveTextContent("LCP: 3.2s");
  });

  it("renders with data-testid on container", () => {
    render(<SourceRef {...defaultProps} />);
    expect(screen.getByTestId("source-ref-LCP")).toBeInTheDocument();
  });

  it("pill has correct styling classes", () => {
    render(<SourceRef {...defaultProps} />);
    const trigger = screen.getByTestId("source-ref-trigger-LCP");
    expect(trigger.className).toContain("bg-blue-500/10");
    expect(trigger.className).toContain("text-blue-400");
    expect(trigger.className).toContain("font-mono");
    expect(trigger.className).toContain("text-xs");
  });

  it("shows chevron icon when detail data is available", () => {
    render(<SourceRef {...defaultProps} />);
    const trigger = screen.getByTestId("source-ref-trigger-LCP");
    const svg = trigger.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("does not show chevron when no detail data", () => {
    render(<SourceRef {...defaultProps} threshold="" rating="" delta="" />);
    const trigger = screen.getByTestId("source-ref-trigger-LCP");
    const svg = trigger.querySelector("svg");
    expect(svg).toBeNull();
  });
});

/* ================================================================== */
/* Expand / Collapse                                                   */
/* ================================================================== */

describe("SourceRef expand/collapse", () => {
  it("is collapsed by default", () => {
    render(<SourceRef {...defaultProps} />);
    expect(screen.queryByTestId("source-ref-panel-LCP")).not.toBeInTheDocument();
  });

  it("expands on click to show detail panel", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));

    expect(screen.getByTestId("source-ref-panel-LCP")).toBeInTheDocument();
    expect(screen.getByText("Largest Contentful Paint")).toBeInTheDocument();
    expect(screen.getByText("2.5s")).toBeInTheDocument();
    expect(screen.getByText("Poor")).toBeInTheDocument();
    expect(screen.getByText("+0.7s")).toBeInTheDocument();
  });

  it("collapses on second click", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    expect(screen.getByTestId("source-ref-panel-LCP")).toBeInTheDocument();

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    expect(screen.queryByTestId("source-ref-panel-LCP")).not.toBeInTheDocument();
  });

  it("does not expand when no detail data", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} threshold="" rating="" delta="" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    expect(screen.queryByTestId("source-ref-panel-LCP")).not.toBeInTheDocument();
  });

  it("shows Current value in expanded panel", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));

    expect(screen.getByText("Current")).toBeInTheDocument();
    // The panel shows "3.2s" as the current value
    const panel = screen.getByTestId("source-ref-panel-LCP");
    expect(panel.textContent).toContain("3.2s");
  });

  it("hides threshold row when threshold is empty", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} threshold="" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));

    expect(screen.queryByText("Threshold")).not.toBeInTheDocument();
  });

  it("hides rating row when rating is empty", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} rating="" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));

    expect(screen.queryByText("Rating")).not.toBeInTheDocument();
  });

  it("hides delta row when delta is empty", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} delta="" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));

    expect(screen.queryByText("Delta")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* Accessibility                                                       */
/* ================================================================== */

describe("SourceRef accessibility", () => {
  it("has aria-expanded=false when collapsed", () => {
    render(<SourceRef {...defaultProps} />);
    expect(screen.getByTestId("source-ref-trigger-LCP")).toHaveAttribute("aria-expanded", "false");
  });

  it("has aria-expanded=true when expanded", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    expect(screen.getByTestId("source-ref-trigger-LCP")).toHaveAttribute("aria-expanded", "true");
  });

  it("has aria-describedby linking to panel when expanded", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    expect(screen.getByTestId("source-ref-trigger-LCP")).toHaveAttribute(
      "aria-describedby",
      "source-ref-panel-LCP"
    );
  });

  it("does not have aria-describedby when collapsed", () => {
    render(<SourceRef {...defaultProps} />);
    expect(screen.getByTestId("source-ref-trigger-LCP")).not.toHaveAttribute("aria-describedby");
  });

  it("panel has role=region and aria-label", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    const panel = screen.getByTestId("source-ref-panel-LCP");
    expect(panel).toHaveAttribute("role", "region");
    expect(panel).toHaveAttribute("aria-label", "Largest Contentful Paint details");
  });

  it("toggles on Enter key", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    screen.getByTestId("source-ref-trigger-LCP").focus();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("source-ref-panel-LCP")).toBeInTheDocument();
  });

  it("toggles on Space key", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    screen.getByTestId("source-ref-trigger-LCP").focus();
    await user.keyboard(" ");

    expect(screen.getByTestId("source-ref-panel-LCP")).toBeInTheDocument();
  });

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    expect(screen.getByTestId("source-ref-panel-LCP")).toBeInTheDocument();

    screen.getByTestId("source-ref-trigger-LCP").focus();
    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("source-ref-panel-LCP")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* Rating colors                                                       */
/* ================================================================== */

describe("SourceRef rating colors", () => {
  it("shows red for Poor rating", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} rating="Poor" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    const ratingEl = screen.getByText("Poor");
    expect(ratingEl.className).toContain("text-red-400");
  });

  it("shows yellow for Needs Improvement rating", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} rating="Needs Improvement" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    const ratingEl = screen.getByText("Needs Improvement");
    expect(ratingEl.className).toContain("text-yellow-400");
  });

  it("shows green for Good rating", async () => {
    const user = userEvent.setup();
    render(<SourceRef {...defaultProps} rating="Good" />);

    await user.click(screen.getByTestId("source-ref-trigger-LCP"));
    const ratingEl = screen.getByText("Good");
    expect(ratingEl.className).toContain("text-green-400");
  });
});
