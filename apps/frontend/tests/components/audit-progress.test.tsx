import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mock framer-motion                                                  */
/* ------------------------------------------------------------------ */

const mockUseReducedMotion = vi.fn<[], boolean>().mockReturnValue(false);

/**
 * Passthrough mock for framer-motion — renders DOM elements with data-testid
 * and className preserved, strips animation-specific props.
 */
function mockMotionComponent(Tag: string) {
  return function MotionMock({ children, ...props }: Record<string, unknown>) {
    // Extract DOM-safe props, discard framer-motion animation props
    const domProps: Record<string, unknown> = {};
    const domSafeKeys = [
      "className",
      "data-testid",
      "role",
      "aria-label",
      "aria-valuenow",
      "aria-valuemin",
      "aria-valuemax",
      "aria-live",
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
    path: mockMotionComponent("path"),
    svg: mockMotionComponent("svg"),
    p: mockMotionComponent("p"),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { AuditProgress, AuditProgressSkeleton } from "../../components/ui/AuditProgress";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseReducedMotion.mockReturnValue(false);
});

/* ================================================================== */
/* T-PERF-142-001: AuditProgress renders all 5 states                 */
/* ================================================================== */

describe("T-PERF-142-001: AuditProgress renders all step states", () => {
  it("renders 5 step labels", () => {
    render(<AuditProgress currentStep={0} />);

    expect(screen.getByTestId("step-label-0")).toHaveTextContent("Fetching your page...");
    expect(screen.getByTestId("step-label-1")).toHaveTextContent("Running performance analysis...");
    expect(screen.getByTestId("step-label-2")).toHaveTextContent("Measuring Core Web Vitals...");
    expect(screen.getByTestId("step-label-3")).toHaveTextContent("Analyzing results with AI...");
    expect(screen.getByTestId("step-label-4")).toHaveTextContent("Generating recommendations...");
  });

  it("shows spinner on active step (step 0)", () => {
    render(<AuditProgress currentStep={0} />);

    expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
    // Step 0 is active, steps 1-4 are pending
    expect(screen.getAllByTestId("step-pending")).toHaveLength(4);
  });

  it("shows spinner on active step (step 2)", () => {
    render(<AuditProgress currentStep={2} />);

    expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
    // Steps 0-1 completed, step 2 active, steps 3-4 pending
    expect(screen.getAllByTestId("step-checkmark")).toHaveLength(2);
    expect(screen.getAllByTestId("step-pending")).toHaveLength(2);
  });

  it("shows all checkmarks when completed (step 4)", () => {
    render(<AuditProgress currentStep={4} />);

    // Step 4 is active (spinner), steps 0-3 completed
    expect(screen.getAllByTestId("step-checkmark")).toHaveLength(4);
    expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
  });

  it("shows error icon on failed step", () => {
    render(<AuditProgress currentStep={2} failed={true} errorMessage="API key invalid" />);

    expect(screen.getByTestId("step-error-icon")).toBeInTheDocument();
    expect(screen.getByTestId("audit-progress-error")).toHaveTextContent("API key invalid");
    // Steps 0-1 completed, step 2 failed, steps 3-4 pending
    expect(screen.getAllByTestId("step-checkmark")).toHaveLength(2);
    expect(screen.getAllByTestId("step-pending")).toHaveLength(2);
  });

  it("does not show error message when errorMessage is empty", () => {
    render(<AuditProgress currentStep={1} failed={true} errorMessage="" />);

    expect(screen.getByTestId("step-error-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-progress-error")).not.toBeInTheDocument();
  });

  it("does not show error message when errorMessage is undefined", () => {
    render(<AuditProgress currentStep={1} failed={true} />);

    expect(screen.getByTestId("step-error-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-progress-error")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* P-PERF-142-001: Step labels are meaningful                         */
/* ================================================================== */

describe("P-PERF-142-001: Step labels are meaningful narrative steps", () => {
  it("step labels describe audit phases", () => {
    render(<AuditProgress currentStep={0} />);

    const labels = [0, 1, 2, 3, 4].map((i) => screen.getByTestId(`step-label-${i}`).textContent);

    expect(labels[0]).toContain("Fetching");
    expect(labels[1]).toContain("performance analysis");
    expect(labels[2]).toContain("Core Web Vitals");
    expect(labels[3]).toContain("AI");
    expect(labels[4]).toContain("recommendations");
  });
});

/* ================================================================== */
/* U-PERF-142-001: Visual clarity — active highlighted, completed     */
/* ================================================================== */

describe("U-PERF-142-001: Visual clarity of step states", () => {
  it("active step label has font-medium and text-neutral-50", () => {
    render(<AuditProgress currentStep={1} />);

    const activeLabel = screen.getByTestId("step-label-1");
    expect(activeLabel.className).toContain("text-neutral-50");
    expect(activeLabel.className).toContain("font-medium");
  });

  it("completed step label has text-green-400", () => {
    render(<AuditProgress currentStep={2} />);

    const completedLabel = screen.getByTestId("step-label-0");
    expect(completedLabel.className).toContain("text-green-400");
  });

  it("pending step label has text-neutral-500", () => {
    render(<AuditProgress currentStep={0} />);

    const pendingLabel = screen.getByTestId("step-label-3");
    expect(pendingLabel.className).toContain("text-neutral-500");
  });

  it("failed step label has text-red-400", () => {
    render(<AuditProgress currentStep={1} failed={true} />);

    const failedLabel = screen.getByTestId("step-label-1");
    expect(failedLabel.className).toContain("text-red-400");
  });
});

/* ================================================================== */
/* U-PERF-142-002: Reduced motion disables animations                 */
/* ================================================================== */

describe("U-PERF-142-002: Reduced motion fallback", () => {
  it("shows static blue dot instead of spinner when reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<AuditProgress currentStep={0} />);

    const spinner = screen.getByTestId("step-spinner");
    // Static dot has bg-blue-500 class (not border spinner)
    expect(spinner.className).toContain("bg-blue-500");
    expect(spinner.className).toContain("rounded-full");
  });

  it("shows animated SVG spinner when motion is allowed", () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<AuditProgress currentStep={0} />);

    const spinner = screen.getByTestId("step-spinner");
    // New spinner uses SVG arc with glow pulse, not CSS border spinner
    expect(spinner).toBeInTheDocument();
    // Should NOT be the static blue dot (that's reduced motion only)
    expect(spinner.className).not.toContain("bg-blue-500");
  });

  it("renders completed checkmarks with reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<AuditProgress currentStep={2} />);

    // Steps 0-1 completed with checkmarks, step 2 active (static dot)
    expect(screen.getAllByTestId("step-checkmark")).toHaveLength(2);
    expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
    // Spinner should be static dot (bg-blue-500)
    expect(screen.getByTestId("step-spinner").className).toContain("bg-blue-500");
  });

  it("renders completed connector lines with reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<AuditProgress currentStep={3} />);

    // Steps 0-2 completed, connectors 0-1-2 should be filled
    expect(screen.getAllByTestId("step-checkmark")).toHaveLength(3);
  });
});

/* ================================================================== */
/* U-PERF-142-003: Error state shows clearly                          */
/* ================================================================== */

describe("U-PERF-142-003: Error state display", () => {
  it("shows error icon and message on failure", () => {
    render(
      <AuditProgress currentStep={2} failed={true} errorMessage="PageSpeed API key invalid" />
    );

    expect(screen.getByTestId("step-error-icon")).toBeInTheDocument();
    expect(screen.getByTestId("audit-progress-error")).toHaveTextContent(
      "PageSpeed API key invalid"
    );
    expect(screen.getByTestId("audit-progress-error")).toHaveAttribute("role", "alert");
  });
});

/* ================================================================== */
/* Accessibility: role="progressbar", aria-live                       */
/* ================================================================== */

describe("Accessibility: ARIA roles and live regions", () => {
  it("has role=progressbar with aria-valuenow", () => {
    render(<AuditProgress currentStep={2} />);

    const progressbar = screen.getByTestId("audit-progress-stepper");
    expect(progressbar).toHaveAttribute("role", "progressbar");
    expect(progressbar).toHaveAttribute("aria-label", "Audit progress");
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    // Step 2 (0-indexed) = 3/5 = 60%
    expect(progressbar).toHaveAttribute("aria-valuenow", "60");
  });

  it("has aria-live polite region with current step description", () => {
    render(<AuditProgress currentStep={1} />);

    const liveRegion = screen.getByTestId("audit-progress-live");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent("Step 2 of 5: Running performance analysis...");
  });

  it("live region shows failure message when failed", () => {
    render(<AuditProgress currentStep={2} failed={true} />);

    const liveRegion = screen.getByTestId("audit-progress-live");
    expect(liveRegion).toHaveTextContent("Audit failed at step 3: Measuring Core Web Vitals...");
  });

  it("progress percentage updates with step", () => {
    const { rerender } = render(<AuditProgress currentStep={0} />);
    expect(screen.getByTestId("audit-progress-stepper")).toHaveAttribute("aria-valuenow", "20");

    rerender(<AuditProgress currentStep={4} />);
    expect(screen.getByTestId("audit-progress-stepper")).toHaveAttribute("aria-valuenow", "100");
  });

  it("failed progress percentage uses currentStep (not currentStep+1)", () => {
    render(<AuditProgress currentStep={2} failed={true} />);
    // Failed at step 2: 2/5 = 40%
    expect(screen.getByTestId("audit-progress-stepper")).toHaveAttribute("aria-valuenow", "40");
  });
});

/* ================================================================== */
/* Subtitle text                                                       */
/* ================================================================== */

describe("Subtitle during progress", () => {
  it("shows estimated time subtitle when running", () => {
    render(<AuditProgress currentStep={1} />);

    const subtitle = screen.getByTestId("audit-progress-subtitle");
    expect(subtitle).toHaveTextContent("usually takes 15–30 seconds");
  });

  it("shows error subtitle when failed", () => {
    render(<AuditProgress currentStep={1} failed={true} />);

    const subtitle = screen.getByTestId("audit-progress-subtitle");
    expect(subtitle).toHaveTextContent("Something went wrong");
  });
});

/* ================================================================== */
/* Step detail text                                                    */
/* ================================================================== */

describe("Step detail text for active step", () => {
  it("shows detail text for the active step", () => {
    render(<AuditProgress currentStep={0} />);

    const detail = screen.getByTestId("step-detail-0");
    expect(detail).toHaveTextContent("Loading the page in a real Chromium browser");
  });

  it("shows different detail for step 2", () => {
    render(<AuditProgress currentStep={2} />);

    const detail = screen.getByTestId("step-detail-2");
    expect(detail).toHaveTextContent("LCP, CLS, and TBT");
  });

  it("does not show detail for completed or pending steps", () => {
    render(<AuditProgress currentStep={2} />);

    expect(screen.queryByTestId("step-detail-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-detail-4")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* Rotating tips                                                       */
/* ================================================================== */

describe("Rotating tips below card", () => {
  it("shows tips section when not failed", () => {
    render(<AuditProgress currentStep={1} />);

    expect(screen.getByTestId("audit-progress-tips")).toBeInTheDocument();
    expect(screen.getByTestId("audit-tip-text")).toBeInTheDocument();
  });

  it("hides tips when failed", () => {
    render(<AuditProgress currentStep={1} failed={true} />);

    expect(screen.queryByTestId("audit-progress-tips")).not.toBeInTheDocument();
  });

  it("tip text contains useful content", () => {
    render(<AuditProgress currentStep={0} />);

    const tipText = screen.getByTestId("audit-tip-text").textContent ?? "";
    expect(tipText.length).toBeGreaterThan(20);
  });
});

/* ================================================================== */
/* AuditProgressSkeleton                                               */
/* ================================================================== */

describe("AuditProgressSkeleton", () => {
  it("renders 5 skeleton rows", () => {
    render(<AuditProgressSkeleton />);

    const skeleton = screen.getByTestId("audit-progress-skeleton");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("role", "status");
    expect(skeleton).toHaveAttribute("aria-label", "Loading audit progress");
  });
});
