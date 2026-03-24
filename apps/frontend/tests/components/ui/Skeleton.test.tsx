import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton } from "../../../components/ui/Skeleton";

describe("Skeleton component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders a status element with Loading label", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  /* ---------------------------------------------------------------- */
  /* Variants                                                          */
  /* ---------------------------------------------------------------- */

  it("applies text variant (rounded) by default", () => {
    render(<Skeleton />);
    const el = screen.getByRole("status");
    expect(el.className).toContain("rounded");
    expect(el.className).not.toContain("rounded-full");
    expect(el.className).not.toContain("rounded-lg");
  });

  it("applies circular variant (rounded-full)", () => {
    render(<Skeleton variant="circular" />);
    expect(screen.getByRole("status").className).toContain("rounded-full");
  });

  it("applies rectangular variant (rounded-lg)", () => {
    render(<Skeleton variant="rectangular" />);
    expect(screen.getByRole("status").className).toContain("rounded-lg");
  });

  /* ---------------------------------------------------------------- */
  /* Dimensions                                                        */
  /* ---------------------------------------------------------------- */

  it("applies width via inline style when provided", () => {
    render(<Skeleton width="200px" />);
    const el = screen.getByRole("status");
    expect(el.style.width).toBe("200px");
  });

  it("applies height via inline style when provided", () => {
    render(<Skeleton height="40px" />);
    const el = screen.getByRole("status");
    expect(el.style.height).toBe("40px");
  });

  it("does not set inline width/height when not provided", () => {
    render(<Skeleton />);
    const el = screen.getByRole("status");
    expect(el.style.width).toBe("");
    expect(el.style.height).toBe("");
  });

  /* ---------------------------------------------------------------- */
  /* Shimmer animation                                                 */
  /* ---------------------------------------------------------------- */

  it("has animate-shimmer class for shimmer effect", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status").className).toContain("animate-shimmer");
  });

  it("has shimmer gradient background classes", () => {
    render(<Skeleton />);
    const cls = screen.getByRole("status").className;
    expect(cls).toContain("bg-[length:200%_100%]");
    expect(cls).toContain("bg-[linear-gradient");
  });

  it("has motion-reduce:animate-none for prefers-reduced-motion", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status").className).toContain("motion-reduce:animate-none");
  });

  /* ---------------------------------------------------------------- */
  /* Custom className                                                  */
  /* ---------------------------------------------------------------- */

  it("merges custom className", () => {
    render(<Skeleton className="my-skeleton" />);
    expect(screen.getByRole("status").className).toContain("my-skeleton");
  });

  /* ---------------------------------------------------------------- */
  /* Background — shimmer gradient colors                              */
  /* ---------------------------------------------------------------- */

  it("uses neutral-800 to neutral-700 shimmer gradient", () => {
    render(<Skeleton />);
    const cls = screen.getByRole("status").className;
    // Gradient includes neutral-800 (#262626) and neutral-700 (#404040)
    expect(cls).toContain("#262626");
    expect(cls).toContain("#404040");
  });
});
