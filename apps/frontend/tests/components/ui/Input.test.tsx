import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Input } from "../../../components/ui/Input";

describe("Input component", () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders label text", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("renders an input element", () => {
    render(<Input label="Name" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("generates an id from the label when id is not provided", () => {
    render(<Input label="First Name" />);
    const input = screen.getByLabelText("First Name");
    expect(input.id).toBe("input-first-name");
  });

  it("uses provided id", () => {
    render(<Input label="Email" id="custom-id" />);
    const input = screen.getByLabelText("Email");
    expect(input.id).toBe("custom-id");
  });

  /* ---------------------------------------------------------------- */
  /* Error state                                                       */
  /* ---------------------------------------------------------------- */

  it("shows error message when error prop is provided", () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
  });

  it("applies aria-invalid when error is present", () => {
    render(<Input label="Email" error="Required" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not apply aria-invalid when no error", () => {
    render(<Input label="Email" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("links error message via aria-describedby", () => {
    render(<Input label="Email" id="email" error="Required" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByText("Required")).toHaveAttribute("id", "email-error");
  });

  it("error message has role=alert", () => {
    render(<Input label="Email" error="Bad input" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad input");
  });

  it("applies red border when error is present", () => {
    render(<Input label="Email" error="Error" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-red-500");
  });

  it("applies neutral border when no error", () => {
    render(<Input label="Email" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-neutral-700");
  });

  it("does not show error when error is empty string", () => {
    render(<Input label="Email" error="" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  /* ---------------------------------------------------------------- */
  /* Helper text                                                       */
  /* ---------------------------------------------------------------- */

  it("shows helper text when provided", () => {
    render(<Input label="Email" helperText="We'll never share your email" />);
    expect(screen.getByText("We'll never share your email")).toBeInTheDocument();
  });

  it("links helper text via aria-describedby", () => {
    render(<Input label="Email" id="email" helperText="Help text" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-describedby", "email-helper");
  });

  it("hides helper text when error is present", () => {
    render(<Input label="Email" helperText="Help" error="Error" />);
    expect(screen.queryByText("Help")).not.toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("does not show helper text when it is empty string", () => {
    render(<Input label="Email" helperText="" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
  });

  /* ---------------------------------------------------------------- */
  /* Disabled state                                                    */
  /* ---------------------------------------------------------------- */

  it("is disabled when disabled prop is true", () => {
    render(<Input label="Email" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  /* ---------------------------------------------------------------- */
  /* Pass-through props                                                */
  /* ---------------------------------------------------------------- */

  it("passes through placeholder", () => {
    render(<Input label="Email" placeholder="you@example.com" />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("passes through type attribute", () => {
    render(<Input label="Password" type="password" />);
    // password inputs don't have textbox role
    const input = document.querySelector("input[type='password']");
    expect(input).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<Input label="Email" className="my-class" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("my-class");
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input label="Email" onChange={handleChange} />);
    await user.type(screen.getByRole("textbox"), "test@example.com");
    expect(handleChange).toHaveBeenCalled();
  });
});
