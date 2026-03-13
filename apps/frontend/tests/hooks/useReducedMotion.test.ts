import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useReducedMotion } from "../../hooks/useReducedMotion";

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const mq = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => {
      listeners.push(fn);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    _listeners: listeners,
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mq),
  });
  return mq;
}

describe("T-P105-001 — useReducedMotion hook", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it("returns false when prefers-reduced-motion is not set", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when prefers-reduced-motion: reduce is active", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("reacts to media query change events", () => {
    const mq = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      mq._listeners.forEach((fn) => fn({ matches: true } as MediaQueryListEvent));
    });

    expect(result.current).toBe(true);
  });

  it("removes the event listener on unmount", () => {
    const mq = mockMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalledOnce();
  });
});
