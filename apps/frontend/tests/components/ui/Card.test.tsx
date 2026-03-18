import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Card } from "../../../components/ui/Card";

describe("Card component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders children content", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("renders as a div element", () => {
    render(<Card>Test</Card>);
    const card = screen.getByText("Test").closest("div");
    expect(card).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Dark theme styling                                                */
  /* ---------------------------------------------------------------- */

  it("has dark theme background", () => {
    render(<Card>Dark</Card>);
    const card = screen.getByText("Dark").closest("div")!;
    expect(card.className).toContain("bg-neutral-900");
  });

  it("has dark theme border", () => {
    render(<Card>Border</Card>);
    const card = screen.getByText("Border").closest("div")!;
    expect(card.className).toContain("border-neutral-800");
  });

  it("has rounded corners", () => {
    render(<Card>Rounded</Card>);
    const card = screen.getByText("Rounded").closest("div")!;
    expect(card.className).toContain("rounded-lg");
  });

  /* ---------------------------------------------------------------- */
  /* Hover effect                                                      */
  /* ---------------------------------------------------------------- */

  it("does not have hover classes by default", () => {
    render(<Card>No hover</Card>);
    const card = screen.getByText("No hover").closest("div")!;
    expect(card.className).not.toContain("cursor-pointer");
    expect(card.className).not.toContain("hover:border-neutral-700");
  });

  it("has hover classes when hoverable is true", () => {
    render(<Card hoverable>Hoverable</Card>);
    const card = screen.getByText("Hoverable").closest("div")!;
    expect(card.className).toContain("cursor-pointer");
    expect(card.className).toContain("hover:border-neutral-700");
    expect(card.className).toContain("transition-colors");
  });

  /* ---------------------------------------------------------------- */
  /* Click handler                                                     */
  /* ---------------------------------------------------------------- */

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Clickable</Card>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("has role=button when onClick is provided", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Interactive</Card>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has tabIndex=0 when onClick is provided", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Focusable</Card>);
    expect(screen.getByRole("button")).toHaveAttribute("tabindex", "0");
  });

  it("does not have role=button when no onClick", () => {
    render(<Card>Static</Card>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Keyboard interaction                                              */
  /* ---------------------------------------------------------------- */

  it("triggers onClick on Enter key", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Enter</Card>);
    const card = screen.getByRole("button");
    card.focus();
    await user.keyboard("{Enter}");
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("triggers onClick on Space key", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Space</Card>);
    const card = screen.getByRole("button");
    card.focus();
    await user.keyboard(" ");
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  /* ---------------------------------------------------------------- */
  /* Custom className                                                  */
  /* ---------------------------------------------------------------- */

  it("merges custom className", () => {
    render(<Card className="my-card">Custom</Card>);
    const card = screen.getByText("Custom").closest("div")!;
    expect(card.className).toContain("my-card");
  });
});
