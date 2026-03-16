import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock window.matchMedia — not available in jsdom by default.
// addListener/removeListener are the deprecated but still-used Framer Motion APIs.
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
