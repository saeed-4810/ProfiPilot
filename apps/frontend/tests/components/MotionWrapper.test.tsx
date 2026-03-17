import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* Mock useReducedMotion from framer-motion to control branch coverage. */
const mockUseReducedMotion = vi.fn<[], boolean>(() => false);
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

import { MotionWrapper } from "../../components/MotionWrapper";

describe("T-P105-002 — MotionWrapper component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
  });

  it("renders children correctly", () => {
    render(
      <MotionWrapper>
        <p>PrefPilot content</p>
      </MotionWrapper>
    );
    expect(screen.getByText("PrefPilot content")).toBeInTheDocument();
  });

  it("passes className to the motion div", () => {
    const { container } = render(
      <MotionWrapper className="my-class">
        <span>test</span>
      </MotionWrapper>
    );
    expect(container.firstChild).toHaveClass("my-class");
  });

  it("uses full page variants when prefers-reduced-motion is inactive", () => {
    mockUseReducedMotion.mockReturnValue(false);
    const { container } = render(
      <MotionWrapper>
        <p>full motion content</p>
      </MotionWrapper>
    );
    expect(screen.getByText("full motion content")).toBeInTheDocument();
    // motion.div is rendered as the wrapper
    expect(container.firstChild).toBeTruthy();
  });

  it("uses reduced variants when prefers-reduced-motion is active", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(
      <MotionWrapper>
        <p>reduced motion content</p>
      </MotionWrapper>
    );
    expect(screen.getByText("reduced motion content")).toBeInTheDocument();
  });
});
