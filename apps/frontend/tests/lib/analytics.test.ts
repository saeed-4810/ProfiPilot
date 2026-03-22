import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnalyticsProvider } from "../../lib/analytics";
import {
  formatEventProperties,
  setAnalyticsProvider,
  getAnalyticsProvider,
  resetAnalyticsProvider,
  track,
  trackPageView,
  trackLoginAttempt,
  trackSignupAttempt,
  trackEmailVerificationSent,
  trackEmailVerificationBlocked,
  trackAuditTrigger,
  trackResultsView,
  trackExportClick,
  createPostHogProvider,
} from "../../lib/analytics";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function createMockProvider(): AnalyticsProvider & { capture: ReturnType<typeof vi.fn> } {
  return { capture: vi.fn() };
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  resetAnalyticsProvider();
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-001: Analytics provider SDK initialized on app load      */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-001: Analytics provider initialization", () => {
  it("setAnalyticsProvider stores the provider", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);
    expect(getAnalyticsProvider()).toBe(mock);
  });

  it("getAnalyticsProvider returns null before initialization", () => {
    expect(getAnalyticsProvider()).toBeNull();
  });

  it("resetAnalyticsProvider clears the provider", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);
    resetAnalyticsProvider();
    expect(getAnalyticsProvider()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-002: PP.track('page_view') sends event to backend        */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-002: track() sends events to analytics backend", () => {
  it("calls provider.capture with event name and properties", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    track("page_view", { route: "/dashboard", timestamp: 1234567890 });

    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.capture).toHaveBeenCalledWith("page_view", {
      route: "/dashboard",
      timestamp: 1234567890,
    });
  });

  it("no-ops silently when no provider is set", () => {
    // Should not throw
    expect(() => track("page_view", { route: "/" })).not.toThrow();
  });

  it("sends events with empty properties when none provided", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    track("page_view");

    expect(mock.capture).toHaveBeenCalledWith("page_view", {});
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-003: PP.track('form_submit') captures form interaction   */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-003: track() captures form interaction events", () => {
  it("sends form_submit with metadata", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    track("form_submit", {
      email_domain: "example.com",
      segment: "agency",
      form_id: "heroForm",
    });

    expect(mock.capture).toHaveBeenCalledWith("form_submit", {
      email_domain: "example.com",
      segment: "agency",
      form_id: "heroForm",
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-004: PP.track('audit_triggered') fires on audit start    */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-004: track() fires audit_triggered event", () => {
  it("sends audit_trigger with url and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackAuditTrigger({ url: "https://example.com", timestamp: 1234567890 });

    expect(mock.capture).toHaveBeenCalledWith("audit_trigger", {
      url: "https://example.com",
      timestamp: 1234567890,
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-005: PP.track('export_downloaded') fires on export       */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-005: track() fires export_click event", () => {
  it("sends export_click with format and audit_id", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackExportClick({ format: "markdown", audit_id: "audit-123" });

    expect(mock.capture).toHaveBeenCalledWith("export_click", {
      format: "markdown",
      audit_id: "audit-123",
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-007: Typed wrappers for all 5 ADR-002 events             */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-007: Typed event helpers match ADR-002 telemetry contract", () => {
  it("trackPageView sends page_view with route and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackPageView({ route: "/audit", timestamp: 1000 });

    expect(mock.capture).toHaveBeenCalledWith("page_view", {
      route: "/audit",
      timestamp: 1000,
    });
  });

  it("trackLoginAttempt sends login_attempt with method and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackLoginAttempt({ method: "email", timestamp: 2000 });

    expect(mock.capture).toHaveBeenCalledWith("login_attempt", {
      method: "email",
      timestamp: 2000,
    });
  });

  it("trackSignupAttempt sends signup_attempt with method and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackSignupAttempt({ method: "email", timestamp: 3000 });

    expect(mock.capture).toHaveBeenCalledWith("signup_attempt", {
      method: "email",
      timestamp: 3000,
    });
  });

  it("trackEmailVerificationSent sends email_verification_sent with method and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackEmailVerificationSent({ method: "auto", timestamp: 4000 });

    expect(mock.capture).toHaveBeenCalledWith("email_verification_sent", {
      method: "auto",
      timestamp: 4000,
    });
  });

  it("trackEmailVerificationBlocked sends email_verification_blocked with timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackEmailVerificationBlocked({ timestamp: 5000 });

    expect(mock.capture).toHaveBeenCalledWith("email_verification_blocked", {
      timestamp: 5000,
    });
  });

  it("trackAuditTrigger sends audit_trigger with url and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackAuditTrigger({ url: "https://test.com", timestamp: 3000 });

    expect(mock.capture).toHaveBeenCalledWith("audit_trigger", {
      url: "https://test.com",
      timestamp: 3000,
    });
  });

  it("trackResultsView sends results_view with audit_id and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackResultsView({ audit_id: "abc-123", timestamp: 4000 });

    expect(mock.capture).toHaveBeenCalledWith("results_view", {
      audit_id: "abc-123",
      timestamp: 4000,
    });
  });

  it("trackExportClick sends export_click with format and audit_id", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackExportClick({ format: "pdf", audit_id: "xyz-789" });

    expect(mock.capture).toHaveBeenCalledWith("export_click", {
      format: "pdf",
      audit_id: "xyz-789",
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-122-008: PostHog API key from env var, not hardcoded         */
/* ------------------------------------------------------------------ */

describe("T-PERF-122-008: createPostHogProvider adapter", () => {
  it("creates an AnalyticsProvider that delegates to posthog.capture", () => {
    const mockPosthog = { capture: vi.fn() };
    const provider = createPostHogProvider(mockPosthog);

    provider.capture("test_event", { key: "value" });

    expect(mockPosthog.capture).toHaveBeenCalledTimes(1);
    expect(mockPosthog.capture).toHaveBeenCalledWith("test_event", { key: "value" });
  });

  it("works without properties", () => {
    const mockPosthog = { capture: vi.fn() };
    const provider = createPostHogProvider(mockPosthog);

    provider.capture("test_event");

    expect(mockPosthog.capture).toHaveBeenCalledWith("test_event", undefined);
  });
});

/* ------------------------------------------------------------------ */
/* P-PERF-122-002: No PII in analytics events                          */
/* ------------------------------------------------------------------ */

describe("P-PERF-122-002: formatEventProperties strips PII fields", () => {
  it("removes email field", () => {
    const result = formatEventProperties({ email: "user@test.com", route: "/dashboard" });
    expect(result).toEqual({ route: "/dashboard" });
    expect(result).not.toHaveProperty("email");
  });

  it("removes name field", () => {
    const result = formatEventProperties({ name: "John Doe", action: "click" });
    expect(result).toEqual({ action: "click" });
    expect(result).not.toHaveProperty("name");
  });

  it("removes uid field", () => {
    const result = formatEventProperties({ uid: "firebase-uid-123", page: "/audit" });
    expect(result).toEqual({ page: "/audit" });
    expect(result).not.toHaveProperty("uid");
  });

  it("removes token field", () => {
    const result = formatEventProperties({ token: "jwt-token-abc", event: "login" });
    expect(result).toEqual({ event: "login" });
    expect(result).not.toHaveProperty("token");
  });

  it("removes password field", () => {
    const result = formatEventProperties({ password: "secret123", action: "submit" });
    expect(result).toEqual({ action: "submit" });
    expect(result).not.toHaveProperty("password");
  });

  it("is case-insensitive for PII field detection", () => {
    const result = formatEventProperties({ Email: "user@test.com", route: "/" });
    expect(result).toEqual({ route: "/" });
  });

  it("preserves non-PII fields", () => {
    const input = {
      route: "/dashboard",
      timestamp: 1234567890,
      segment: "agency",
      email_domain: "example.com",
      format: "pdf",
    };
    const result = formatEventProperties(input);
    expect(result).toEqual(input);
  });

  it("returns empty object for empty input", () => {
    expect(formatEventProperties({})).toEqual({});
  });

  it("strips multiple PII fields at once", () => {
    const result = formatEventProperties({
      email: "a@b.com",
      name: "Test",
      uid: "123",
      token: "abc",
      password: "secret",
      route: "/safe",
    });
    expect(result).toEqual({ route: "/safe" });
  });
});

/* ------------------------------------------------------------------ */
/* P-PERF-122-001: Analytics data visible in provider dashboard        */
/* ------------------------------------------------------------------ */

describe("P-PERF-122-001: End-to-end event flow through provider", () => {
  it("track() with provider sends formatted event to capture", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    track("lp_view", { context: "page", url: "https://nimblevitals.app", session: "abc123" });

    expect(mock.capture).toHaveBeenCalledWith("lp_view", {
      context: "page",
      url: "https://nimblevitals.app",
      session: "abc123",
    });
  });

  it("track() strips PII before sending to provider", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    track("form_submit", {
      email: "user@test.com",
      email_domain: "test.com",
      segment: "agency",
    });

    expect(mock.capture).toHaveBeenCalledWith("form_submit", {
      email_domain: "test.com",
      segment: "agency",
    });
    // Verify email was stripped
    const capturedProps = mock.capture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(capturedProps).not.toHaveProperty("email");
  });
});

/* ------------------------------------------------------------------ */
/* U-PERF-122-001: Analytics loading does not degrade performance      */
/* ------------------------------------------------------------------ */

describe("U-PERF-122-001: Graceful degradation without provider", () => {
  it("track() does not throw when provider is not set", () => {
    expect(() => track("page_view", { route: "/" })).not.toThrow();
  });

  it("typed helpers do not throw when provider is not set", () => {
    expect(() => trackPageView({ route: "/", timestamp: 0 })).not.toThrow();
    expect(() => trackLoginAttempt({ method: "email", timestamp: 0 })).not.toThrow();
    expect(() => trackSignupAttempt({ method: "email", timestamp: 0 })).not.toThrow();
    expect(() => trackEmailVerificationSent({ method: "auto", timestamp: 0 })).not.toThrow();
    expect(() => trackEmailVerificationBlocked({ timestamp: 0 })).not.toThrow();
    expect(() => trackAuditTrigger({ url: "https://x.com", timestamp: 0 })).not.toThrow();
    expect(() => trackResultsView({ audit_id: "x", timestamp: 0 })).not.toThrow();
    expect(() => trackExportClick({ format: "pdf", audit_id: "x" })).not.toThrow();
  });
});
