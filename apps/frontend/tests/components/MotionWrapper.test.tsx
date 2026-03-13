import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MotionWrapper } from "../../components/MotionWrapper";

describe("T-P105-002 — MotionWrapper component", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
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

  it("uses reduced variants when prefers-reduced-motion is active", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(
      <MotionWrapper>
        <p>reduced motion content</p>
      </MotionWrapper>
    );
    expect(screen.getByText("reduced motion content")).toBeInTheDocument();
  });
});
