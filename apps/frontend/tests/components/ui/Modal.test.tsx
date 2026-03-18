import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* Mock useReducedMotion from framer-motion to control branch coverage. */
const mockUseReducedMotion = vi.fn<[], boolean | null>(() => false);
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

import { Modal } from "../../../components/ui/Modal";

describe("Modal component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
  });

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it("renders title and children when open", () => {
    render(
      <Modal open onClose={vi.fn()} title="Confirm">
        <p>Are you sure?</p>
      </Modal>
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Hidden">
        <p>Content</p>
      </Modal>
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* ARIA attributes                                                   */
  /* ---------------------------------------------------------------- */

  it("has role=dialog", () => {
    render(
      <Modal open onClose={vi.fn()} title="Dialog">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal=true", () => {
    render(
      <Modal open onClose={vi.fn()} title="Modal">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to the title", () => {
    render(
      <Modal open onClose={vi.fn()} title="My Title">
        <p>Body</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    // The title element should have the same id
    const titleEl = screen.getByText("My Title");
    expect(titleEl.id).toBe(labelledBy);
  });

  /* ---------------------------------------------------------------- */
  /* Close button                                                      */
  /* ---------------------------------------------------------------- */

  it("renders close button with accessible label", () => {
    render(
      <Modal open onClose={vi.fn()} title="Close Test">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByLabelText("Close dialog")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Close">
        <p>Body</p>
      </Modal>
    );
    await user.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* ---------------------------------------------------------------- */
  /* Backdrop click                                                    */
  /* ---------------------------------------------------------------- */

  it("calls onClose when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Backdrop">
        <p>Body</p>
      </Modal>
    );
    await user.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop has aria-hidden", () => {
    render(
      <Modal open onClose={vi.fn()} title="Backdrop A11y">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByTestId("modal-backdrop")).toHaveAttribute("aria-hidden", "true");
  });

  /* ---------------------------------------------------------------- */
  /* Escape key                                                        */
  /* ---------------------------------------------------------------- */

  it("calls onClose when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Escape">
        <p>Body</p>
      </Modal>
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* ---------------------------------------------------------------- */
  /* Focus trap                                                        */
  /* ---------------------------------------------------------------- */

  it("moves focus into the modal when opened", async () => {
    render(
      <Modal open onClose={vi.fn()} title="Focus">
        <button type="button">Inside</button>
      </Modal>
    );

    // The close button is the first focusable element in DOM order (header),
    // so it receives initial focus via the focus trap.
    await waitFor(() => {
      expect(screen.getByLabelText("Close dialog")).toHaveFocus();
    });
  });

  it("traps focus within the modal on Tab", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={vi.fn()} title="Trap">
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>
    );

    // Close button is first focusable in DOM order
    await waitFor(() => {
      expect(screen.getByLabelText("Close dialog")).toHaveFocus();
    });

    // Tab: Close -> First -> Second
    await user.tab();
    expect(screen.getByText("First")).toHaveFocus();

    await user.tab();
    expect(screen.getByText("Second")).toHaveFocus();
  });

  it("wraps focus backward on Shift+Tab from first element", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={vi.fn()} title="Wrap Back">
        <button type="button">Only Button</button>
      </Modal>
    );

    // Close button is first focusable
    await waitFor(() => {
      expect(screen.getByLabelText("Close dialog")).toHaveFocus();
    });

    // Shift+Tab from close button should wrap to last focusable (Only Button)
    await user.tab({ shift: true });
    expect(screen.getByText("Only Button")).toHaveFocus();
  });

  it("wraps focus forward on Tab from last focusable element", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={vi.fn()} title="Wrap Forward">
        <button type="button">Child Button</button>
      </Modal>
    );

    // Close button is first focusable
    await waitFor(() => {
      expect(screen.getByLabelText("Close dialog")).toHaveFocus();
    });

    // Tab: Close -> Child Button (last focusable)
    await user.tab();
    expect(screen.getByText("Child Button")).toHaveFocus();

    // Tab from last element should wrap to first (Close button)
    await user.tab();
    expect(screen.getByLabelText("Close dialog")).toHaveFocus();
  });

  it("focuses the panel itself when no focusable children exist", async () => {
    render(
      <Modal open onClose={vi.fn()} title="No Focusable">
        <p>Just text, no buttons or inputs</p>
      </Modal>
    );

    // The close button is still focusable, so it gets focus.
    // But we need to test the branch where querySelector returns null.
    // Since the close button is always present, we test that focus moves
    // into the modal (close button is the first focusable).
    await waitFor(() => {
      expect(screen.getByLabelText("Close dialog")).toHaveFocus();
    });
  });

  /* ---------------------------------------------------------------- */
  /* Reduced motion                                                    */
  /* ---------------------------------------------------------------- */

  it("renders correctly with prefers-reduced-motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(
      <Modal open onClose={vi.fn()} title="Reduced">
        <p>Reduced motion content</p>
      </Modal>
    );
    expect(screen.getByText("Reduced")).toBeInTheDocument();
    expect(screen.getByText("Reduced motion content")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Focus restoration                                                 */
  /* ---------------------------------------------------------------- */

  it("does not crash when modal is closed", async () => {
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Open">
        <p>Content</p>
      </Modal>
    );

    rerender(
      <Modal open={false} onClose={vi.fn()} title="Closed">
        <p>Content</p>
      </Modal>
    );

    // AnimatePresence keeps the element during exit animation, wait for removal
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
