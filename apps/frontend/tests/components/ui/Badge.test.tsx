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
});
