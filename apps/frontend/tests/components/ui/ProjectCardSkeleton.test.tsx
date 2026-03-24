import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProjectCardSkeleton } from "../../../components/ui/ProjectCardSkeleton";

describe("ProjectCardSkeleton component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders with data-testid", () => {
    render(<ProjectCardSkeleton />);
    expect(screen.getByTestId("project-card-skeleton")).toBeInTheDocument();
  });

  it("has role=status and aria-label for accessibility", () => {
    render(<ProjectCardSkeleton />);
    const el = screen.getByTestId("project-card-skeleton");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-label", "Loading project card");
  });

  /* ---------------------------------------------------------------- */
  /* Card shape — matches project card layout                          */
  /* ---------------------------------------------------------------- */

  it("has project card container classes", () => {
    render(<ProjectCardSkeleton />);
    const el = screen.getByTestId("project-card-skeleton");
    expect(el.className).toContain("rounded-2xl");
    expect(el.className).toContain("border-neutral-800/50");
    expect(el.className).toContain("bg-neutral-900/80");
    expect(el.className).toContain("p-6");
  });

  /* ---------------------------------------------------------------- */
  /* Skeleton children — correct structure                             */
  /* ---------------------------------------------------------------- */

  it("renders multiple Skeleton loading elements", () => {
    render(<ProjectCardSkeleton />);
    const skeletons = screen.getAllByRole("status");
    // Container has role=status + inner Skeleton elements
    // Header: circular (globe) + name + url + status = 4
    // Metrics: 3 cards × 3 skeletons each = 9
    // Footer: 2
    // Total inner = 15, plus container = 16
    expect(skeletons.length).toBeGreaterThanOrEqual(15);
  });

  it("renders a circular skeleton for the globe icon", () => {
    render(<ProjectCardSkeleton />);
    const skeletons = screen.getAllByRole("status");
    const circularSkeletons = skeletons.filter((el) => el.className.includes("rounded-full"));
    expect(circularSkeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Skeleton elements with shimmer animation", () => {
    render(<ProjectCardSkeleton />);
    const skeletons = screen.getAllByRole("status");
    const shimmerSkeletons = skeletons.filter((el) => el.className.includes("animate-shimmer"));
    expect(shimmerSkeletons.length).toBeGreaterThanOrEqual(10);
  });

  /* ---------------------------------------------------------------- */
  /* Health metric mini-cards                                          */
  /* ---------------------------------------------------------------- */

  it("renders 3 health metric placeholder areas", () => {
    render(<ProjectCardSkeleton />);
    const el = screen.getByTestId("project-card-skeleton");
    // The 3 mini metric cards have bg-neutral-800/50 class
    const metricCards = el.querySelectorAll(".bg-neutral-800\\/50");
    expect(metricCards).toHaveLength(3);
  });
});
