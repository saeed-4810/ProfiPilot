import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "../../../components/ui/Button";

describe("Button component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("renders as a button element", () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Variants                                                          */
  /* ---------------------------------------------------------------- */

  it("applies primary variant classes by default", () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-blue-600");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-neutral-700");
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-red-600");
  });

  /* ---------------------------------------------------------------- */
  /* Sizes                                                             */
  /* ---------------------------------------------------------------- */

  it("applies sm size classes", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-3");
    expect(btn.className).toContain("py-1.5");
  });

  it("applies md size classes by default", () => {
    render(<Button>Medium</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-4");
    expect(btn.className).toContain("py-2");
  });

  it("applies lg size classes", () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-6");
    expect(btn.className).toContain("py-3");
  });

  /* ---------------------------------------------------------------- */
  /* Disabled state                                                    */
  /* ---------------------------------------------------------------- */

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading is true", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  /* ---------------------------------------------------------------- */
  /* Loading state                                                     */
  /* ---------------------------------------------------------------- */

  it("shows spinner when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
  });

  it("hides spinner when not loading", () => {
    render(<Button>Not loading</Button>);
    expect(screen.queryByTestId("button-spinner")).not.toBeInTheDocument();
  });

  it("spinner has aria-hidden", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByTestId("button-spinner")).toHaveAttribute("aria-hidden", "true");
  });

  it("spinner respects prefers-reduced-motion", () => {
    render(<Button loading>Loading</Button>);
    const spinner = screen.getByTestId("button-spinner");
    expect(spinner.className).toContain("motion-reduce:animate-none");
  });

  /* ---------------------------------------------------------------- */
  /* Click handler                                                     */
  /* ---------------------------------------------------------------- */

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} disabled>
        Click
      </Button>
    );
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /* Accessibility                                                     */
  /* ---------------------------------------------------------------- */

  it("has focus ring classes for keyboard navigation", () => {
    render(<Button>Focus</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("focus:ring-2");
  });

  it("passes through type attribute", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("merges custom className", () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("my-custom-class");
  });
});
