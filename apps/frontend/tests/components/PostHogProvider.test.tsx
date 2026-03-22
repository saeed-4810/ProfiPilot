import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

/* ------------------------------------------------------------------ */
/* Mocks — posthog-js                                                  */
/* ------------------------------------------------------------------ */

const mockInit = vi.fn();
const mockCapture = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: (...args: unknown[]) => mockInit(...args),
    capture: (...args: unknown[]) => mockCapture(...args),
  },
}));

/* Mock lib/analytics to verify provider wiring */
const mockSetAnalyticsProvider = vi.fn();
const mockCreatePostHogProvider = vi.fn().mockReturnValue({ capture: vi.fn() });

vi.mock("@/lib/analytics", () => ({
  setAnalyticsProvider: (...args: unknown[]) => mockSetAnalyticsProvider(...args),
  createPostHogProvider: (...args: unknown[]) => mockCreatePostHogProvider(...args),
}));

/* Import after mocks */
import { PostHogProvider } from "../../components/PostHogProvider";

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-001: PostHog SDK initialized on app load                 */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-001: PostHogProvider initialization", () => {
  it("renders children", () => {
    const { getByText } = render(
      <PostHogProvider>
        <div>Test Child</div>
      </PostHogProvider>
    );
    expect(getByText("Test Child")).toBeInTheDocument();
  });

  it("does not call posthog.init when apiKey is empty", () => {
    render(
      <PostHogProvider apiKey="">
        <div>No Key</div>
      </PostHogProvider>
    );

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("calls posthog.init with correct config when apiKey is provided", () => {
    render(
      <PostHogProvider apiKey="phc_test_key_123" apiHost="https://eu.i.posthog.com">
        <div>With Key</div>
      </PostHogProvider>
    );

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith("phc_test_key_123", {
      api_host: "https://eu.i.posthog.com",
      persistence: "memory",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      loaded: expect.any(Function),
    });
  });

  it("sets analytics provider via loaded callback", () => {
    render(
      <PostHogProvider apiKey="phc_test_key_456">
        <div>Callback Test</div>
      </PostHogProvider>
    );

    // Extract and invoke the loaded callback
    const initCall = mockInit.mock.calls[0] as unknown[];
    const config = initCall[1] as { loaded: () => void };
    config.loaded();

    expect(mockCreatePostHogProvider).toHaveBeenCalledTimes(1);
    expect(mockSetAnalyticsProvider).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* U-PERF-122-002: No cookie consent banner required                   */
/* ------------------------------------------------------------------ */

describe("U-PERF-122-002: PostHogProvider renders without consent banner", () => {
  it("renders only children, no consent UI elements", () => {
    const { container } = render(
      <PostHogProvider>
        <div data-testid="app-content">App</div>
      </PostHogProvider>
    );

    // No consent banner, cookie notice, or modal rendered
    expect(container.querySelector("[data-testid='consent-banner']")).toBeNull();
    expect(container.querySelector("[data-testid='cookie-notice']")).toBeNull();
  });

  it("configures PostHog with persistence: memory (cookieless)", () => {
    render(
      <PostHogProvider apiKey="phc_cookie_test">
        <div>Cookieless</div>
      </PostHogProvider>
    );

    const initCall = mockInit.mock.calls[0] as unknown[];
    const config = initCall[1] as { persistence: string };
    expect(config.persistence).toBe("memory");
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-008: API key from env var, not hardcoded                 */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-008: PostHog API key configuration", () => {
  it("defaults to empty key when no env var or prop is set", () => {
    render(
      <PostHogProvider>
        <div>Default</div>
      </PostHogProvider>
    );

    // Should not init because default key is empty in test env
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("uses provided apiKey prop over default", () => {
    render(
      <PostHogProvider apiKey="phc_custom_key">
        <div>Custom</div>
      </PostHogProvider>
    );

    const initCall = mockInit.mock.calls[0] as unknown[];
    expect(initCall[0]).toBe("phc_custom_key");
  });

  it("uses provided apiHost prop", () => {
    render(
      <PostHogProvider apiKey="phc_host_test" apiHost="https://custom.posthog.com">
        <div>Custom Host</div>
      </PostHogProvider>
    );

    const initCall = mockInit.mock.calls[0] as unknown[];
    const config = initCall[1] as { api_host: string };
    expect(config.api_host).toBe("https://custom.posthog.com");
  });
});
