import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MetricCardSkeleton } from "../../../components/ui/MetricCardSkeleton";

describe("MetricCardSkeleton component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders with data-testid", () => {
    render(<MetricCardSkeleton />);
    expect(screen.getByTestId("metric-card-skeleton")).toBeInTheDocument();
  });

  it("has role=status and aria-label for accessibility", () => {
    render(<MetricCardSkeleton />);
    const el = screen.getByTestId("metric-card-skeleton");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-label", "Loading metric card");
  });

  /* ---------------------------------------------------------------- */
  /* Card shape — matches MetricCard layout                            */
  /* ---------------------------------------------------------------- */

  it("has MetricCard-matching container classes", () => {
    render(<MetricCardSkeleton />);
    const el = screen.getByTestId("metric-card-skeleton");
    expect(el.className).toContain("rounded-xl");
    expect(el.className).toContain("border-neutral-800");
    expect(el.className).toContain("bg-neutral-900");
    expect(el.className).toContain("p-5");
  });

  /* ---------------------------------------------------------------- */
  /* Skeleton children — correct number of loading placeholders        */
  /* ---------------------------------------------------------------- */

  it("renders multiple Skeleton loading elements", () => {
    render(<MetricCardSkeleton />);
    const skeletons = screen.getAllByRole("status");
    // Container has role=status + 5 inner Skeleton elements = 6 total
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
  });

  it("renders Skeleton elements with shimmer animation", () => {
    render(<MetricCardSkeleton />);
    const skeletons = screen.getAllByRole("status");
    // Inner skeletons (not the container) should have animate-shimmer
    const shimmerSkeletons = skeletons.filter((el) => el.className.includes("animate-shimmer"));
    expect(shimmerSkeletons.length).toBeGreaterThanOrEqual(5);
  });
});
