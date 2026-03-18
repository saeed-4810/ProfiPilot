import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Mock useReducedMotion from framer-motion to control branch coverage. */
const mockUseReducedMotion = vi.fn<[], boolean | null>(() => false);
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

import { Toast } from "../../../components/ui/Toast";

describe("Toast component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders message text when open", () => {
    render(<Toast message="Success!" onDismiss={vi.fn()} open />);
    expect(screen.getByText("Success!")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(<Toast message="Hidden" onDismiss={vi.fn()} open={false} />);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders with open=true by default", () => {
    render(<Toast message="Default open" onDismiss={vi.fn()} />);
    expect(screen.getByText("Default open")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* ARIA roles                                                        */
  /* ---------------------------------------------------------------- */

  it("has role=alert for error type", () => {
    render(<Toast message="Error!" type="error" onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("has role=status for success type", () => {
    render(<Toast message="Done!" type="success" onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has role=status for info type", () => {
    render(<Toast message="Info" type="info" onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("defaults to info type (role=status)", () => {
    render(<Toast message="Default" onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Type styling                                                      */
  /* ---------------------------------------------------------------- */

  it("applies success styling", () => {
    render(<Toast message="OK" type="success" onDismiss={vi.fn()} />);
    const toast = screen.getByRole("status");
    expect(toast.className).toContain("bg-green-900/90");
  });

  it("applies error styling", () => {
    render(<Toast message="Fail" type="error" onDismiss={vi.fn()} />);
    const toast = screen.getByRole("alert");
    expect(toast.className).toContain("bg-red-900/90");
  });

  it("applies info styling", () => {
    render(<Toast message="Note" type="info" onDismiss={vi.fn()} />);
    const toast = screen.getByRole("status");
    expect(toast.className).toContain("bg-blue-900/90");
  });

  /* ---------------------------------------------------------------- */
  /* Auto-dismiss                                                      */
  /* ---------------------------------------------------------------- */

  it("calls onDismiss after default duration (5000ms)", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Auto" onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss after custom duration", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Custom" onDismiss={onDismiss} duration={2000} />);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not auto-dismiss when open is false", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Closed" onDismiss={onDismiss} open={false} duration={1000} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("clears timer on unmount", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast message="Unmount" onDismiss={onDismiss} duration={3000} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /* Dismiss button                                                    */
  /* ---------------------------------------------------------------- */

  it("renders dismiss button with accessible label", () => {
    render(<Toast message="Dismiss me" onDismiss={vi.fn()} />);
    expect(screen.getByLabelText("Dismiss notification")).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Click X" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByLabelText("Dismiss notification"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /* ---------------------------------------------------------------- */
  /* Reduced motion                                                    */
  /* ---------------------------------------------------------------- */

  it("renders correctly with prefers-reduced-motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<Toast message="Reduced" onDismiss={vi.fn()} />);
    expect(screen.getByText("Reduced")).toBeInTheDocument();
  });
});
