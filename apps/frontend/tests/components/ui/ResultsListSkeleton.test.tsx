import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ResultsListSkeleton } from "../../../components/ui/ResultsListSkeleton";

describe("ResultsListSkeleton component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders with data-testid", () => {
    render(<ResultsListSkeleton />);
    expect(screen.getByTestId("results-list-skeleton")).toBeInTheDocument();
  });

  it("has role=status and aria-label for accessibility", () => {
    render(<ResultsListSkeleton />);
    const el = screen.getByTestId("results-list-skeleton");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-label", "Loading recommendations");
  });

  /* ---------------------------------------------------------------- */
  /* Default count — 3 cards                                           */
  /* ---------------------------------------------------------------- */

  it("renders 3 skeleton cards by default", () => {
    render(<ResultsListSkeleton />);
    expect(screen.getByTestId("results-skeleton-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("results-skeleton-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("results-skeleton-card-2")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Custom count                                                      */
  /* ---------------------------------------------------------------- */

  it("renders custom number of skeleton cards", () => {
    render(<ResultsListSkeleton count={5} />);
    expect(screen.getByTestId("results-skeleton-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("results-skeleton-card-4")).toBeInTheDocument();
    expect(screen.queryByTestId("results-skeleton-card-5")).not.toBeInTheDocument();
  });

  it("renders 1 skeleton card when count is 1", () => {
    render(<ResultsListSkeleton count={1} />);
    expect(screen.getByTestId("results-skeleton-card-0")).toBeInTheDocument();
    expect(screen.queryByTestId("results-skeleton-card-1")).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Card shape — matches recommendation card layout                   */
  /* ---------------------------------------------------------------- */

  it("each card has recommendation-matching container classes", () => {
    render(<ResultsListSkeleton count={1} />);
    const card = screen.getByTestId("results-skeleton-card-0");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("border-neutral-800");
    expect(card.className).toContain("bg-neutral-900");
    expect(card.className).toContain("p-6");
  });

  it("each card has a top accent border", () => {
    render(<ResultsListSkeleton count={1} />);
    const card = screen.getByTestId("results-skeleton-card-0");
    expect(card.className).toContain("border-t-2");
    expect(card.className).toContain("border-t-neutral-700");
  });

  /* ---------------------------------------------------------------- */
  /* Skeleton children — shimmer animation                             */
  /* ---------------------------------------------------------------- */

  it("renders Skeleton elements with shimmer animation inside cards", () => {
    render(<ResultsListSkeleton count={1} />);
    const skeletons = screen.getAllByRole("status");
    const shimmerSkeletons = skeletons.filter((el) => el.className.includes("animate-shimmer"));
    // Each card has 6 inner Skeleton elements (badge + metric + tag + 2 desc lines + pills)
    expect(shimmerSkeletons.length).toBeGreaterThanOrEqual(6);
  });

  /* ---------------------------------------------------------------- */
  /* Container layout                                                  */
  /* ---------------------------------------------------------------- */

  it("has space-y-3 gap between cards", () => {
    render(<ResultsListSkeleton />);
    const container = screen.getByTestId("results-list-skeleton");
    expect(container.className).toContain("space-y-3");
  });
});
