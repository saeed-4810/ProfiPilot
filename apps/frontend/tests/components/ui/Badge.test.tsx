import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../../../components/ui/Badge";

describe("Badge component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders label text", () => {
    render(<Badge label="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    render(<Badge label="Test" />);
    const badge = screen.getByText("Test");
    expect(badge.tagName).toBe("SPAN");
  });

  /* ---------------------------------------------------------------- */
  /* Variants                                                          */
  /* ---------------------------------------------------------------- */

  it("applies neutral variant by default", () => {
    render(<Badge label="Default" />);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-neutral-800");
    expect(badge.className).toContain("text-neutral-300");
  });

  it("applies success variant", () => {
    render(<Badge label="Success" variant="success" />);
    const badge = screen.getByText("Success");
    expect(badge.className).toContain("bg-green-900/50");
    expect(badge.className).toContain("text-green-300");
    expect(badge.className).toContain("border-green-700");
  });

  it("applies warning variant", () => {
    render(<Badge label="Warning" variant="warning" />);
    const badge = screen.getByText("Warning");
    expect(badge.className).toContain("bg-yellow-900/50");
    expect(badge.className).toContain("text-yellow-300");
    expect(badge.className).toContain("border-yellow-700");
  });

  it("applies error variant", () => {
    render(<Badge label="Error" variant="error" />);
    const badge = screen.getByText("Error");
    expect(badge.className).toContain("bg-red-900/50");
    expect(badge.className).toContain("text-red-300");
    expect(badge.className).toContain("border-red-700");
  });

  it("applies info variant", () => {
    render(<Badge label="Info" variant="info" />);
    const badge = screen.getByText("Info");
    expect(badge.className).toContain("bg-blue-900/50");
    expect(badge.className).toContain("text-blue-300");
    expect(badge.className).toContain("border-blue-700");
  });

  /* ---------------------------------------------------------------- */
  /* Severity variants — PERF-143                                      */
  /* ---------------------------------------------------------------- */

  it("applies severity-good variant with green colors", () => {
    render(<Badge label="Good" variant="severity-good" />);
    const badge = screen.getByText("Good");
    expect(badge.className).toContain("bg-green-500/10");
    expect(badge.className).toContain("text-green-400");
    expect(badge.className).toContain("border-green-500/20");
  });

  it("applies severity-warning variant with yellow colors", () => {
    render(<Badge label="Needs Improvement" variant="severity-warning" />);
    const badge = screen.getByText("Needs Improvement");
    expect(badge.className).toContain("bg-yellow-500/10");
    expect(badge.className).toContain("text-yellow-400");
    expect(badge.className).toContain("border-yellow-500/20");
  });

  it("applies severity-error variant with red colors", () => {
    render(<Badge label="Poor" variant="severity-error" />);
    const badge = screen.getByText("Poor");
    expect(badge.className).toContain("bg-red-500/10");
    expect(badge.className).toContain("text-red-400");
    expect(badge.className).toContain("border-red-500/20");
  });

  /* ---------------------------------------------------------------- */
  /* Severity icon prefixes — PERF-143                                 */
  /* ---------------------------------------------------------------- */

  it("renders icon prefix for severity-good variant", () => {
    render(<Badge label="Good" variant="severity-good" />);
    expect(screen.getByTestId("badge-icon")).toBeInTheDocument();
  });

  it("renders icon prefix for severity-warning variant", () => {
    render(<Badge label="Warning" variant="severity-warning" />);
    expect(screen.getByTestId("badge-icon")).toBeInTheDocument();
  });

  it("renders icon prefix for severity-error variant", () => {
    render(<Badge label="Error" variant="severity-error" />);
    expect(screen.getByTestId("badge-icon")).toBeInTheDocument();
  });

  it("does not render icon for non-severity variants", () => {
    render(<Badge label="Success" variant="success" />);
    expect(screen.queryByTestId("badge-icon")).not.toBeInTheDocument();
  });

  it("does not render icon for neutral variant", () => {
    render(<Badge label="Neutral" />);
    expect(screen.queryByTestId("badge-icon")).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Styling                                                           */
  /* ---------------------------------------------------------------- */

  it("has rounded-full shape", () => {
    render(<Badge label="Pill" />);
    expect(screen.getByText("Pill").className).toContain("rounded-full");
  });

  it("has border", () => {
    render(<Badge label="Bordered" />);
    expect(screen.getByText("Bordered").className).toContain("border");
  });

  it("has small text size", () => {
    render(<Badge label="Small" />);
    expect(screen.getByText("Small").className).toContain("text-xs");
  });

  it("has gap class for icon spacing", () => {
    render(<Badge label="Spaced" />);
    expect(screen.getByText("Spaced").className).toContain("gap-1");
  });
});
