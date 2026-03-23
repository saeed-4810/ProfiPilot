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
  trackGoogleSigninAttempt,
  trackGoogleSigninSuccess,
  trackGoogleSigninError,
  trackEmailVerificationSent,
  trackEmailVerificationBlocked,
  trackAuditTrigger,
  trackResultsView,
  trackExportClick,
  trackFeedbackSurveyShown,
  trackFeedbackSurveySubmitted,
  trackFeedbackSurveyDismissed,
  trackNpsPromptShown,
  trackNpsScoreSubmitted,
  trackFrictionReportSubmitted,
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

  it("trackGoogleSigninAttempt sends google_signin_attempt with timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackGoogleSigninAttempt({ timestamp: 6000 });

    expect(mock.capture).toHaveBeenCalledWith("google_signin_attempt", { timestamp: 6000 });
  });

  it("trackGoogleSigninSuccess sends google_signin_success with timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackGoogleSigninSuccess({ timestamp: 7000 });

    expect(mock.capture).toHaveBeenCalledWith("google_signin_success", { timestamp: 7000 });
  });

  it("trackGoogleSigninError sends google_signin_error with error_code and timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackGoogleSigninError({ error_code: "auth/popup-blocked", timestamp: 8000 });

    expect(mock.capture).toHaveBeenCalledWith("google_signin_error", {
      error_code: "auth/popup-blocked",
      timestamp: 8000,
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
/* T-PERF-141: Typed wrappers for 6 feedback events                    */
/* ------------------------------------------------------------------ */

describe("T-PERF-141: Feedback event typed helpers", () => {
  it("trackFeedbackSurveyShown sends feedback_survey_shown with trigger, page, timestamp", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackFeedbackSurveyShown({ trigger: "first_audit", page: "/results", timestamp: 9000 });

    expect(mock.capture).toHaveBeenCalledWith("feedback_survey_shown", {
      trigger: "first_audit",
      page: "/results",
      timestamp: 9000,
    });
  });

  it("trackFeedbackSurveySubmitted sends feedback_survey_submitted with all fields", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackFeedbackSurveySubmitted({
      trigger: "third_session",
      q1_value_rating: 4,
      q2_ease_rating: 5,
      q5_nps_score: 8,
      q7_wtp: "49",
      q8_pmf: "very_disappointed",
      has_open_text: true,
      completion_time_ms: 45000,
      page: "/results",
      timestamp: 10000,
    });

    expect(mock.capture).toHaveBeenCalledWith("feedback_survey_submitted", {
      trigger: "third_session",
      q1_value_rating: 4,
      q2_ease_rating: 5,
      q5_nps_score: 8,
      q7_wtp: "49",
      q8_pmf: "very_disappointed",
      has_open_text: true,
      completion_time_ms: 45000,
      page: "/results",
      timestamp: 10000,
    });
  });

  it("trackFeedbackSurveyDismissed sends feedback_survey_dismissed with dismiss_type", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackFeedbackSurveyDismissed({
      trigger: "first_export",
      dismiss_type: "remind_later",
      page: "/export",
      timestamp: 11000,
    });

    expect(mock.capture).toHaveBeenCalledWith("feedback_survey_dismissed", {
      trigger: "first_export",
      dismiss_type: "remind_later",
      page: "/export",
      timestamp: 11000,
    });
  });

  it("trackNpsPromptShown sends nps_prompt_shown with audit_count", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackNpsPromptShown({ audit_count: 5, page: "/results", timestamp: 12000 });

    expect(mock.capture).toHaveBeenCalledWith("nps_prompt_shown", {
      audit_count: 5,
      page: "/results",
      timestamp: 12000,
    });
  });

  it("trackNpsScoreSubmitted sends nps_score_submitted with score and category", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackNpsScoreSubmitted({
      score: 9,
      category: "promoter",
      has_followup: true,
      page: "/results",
      timestamp: 13000,
    });

    expect(mock.capture).toHaveBeenCalledWith("nps_score_submitted", {
      score: 9,
      category: "promoter",
      has_followup: true,
      page: "/results",
      timestamp: 13000,
    });
  });

  it("trackFrictionReportSubmitted sends friction_report_submitted with category", () => {
    const mock = createMockProvider();
    setAnalyticsProvider(mock);

    trackFrictionReportSubmitted({
      category: "bug",
      has_screenshot: true,
      page: "/audit",
      session_duration_s: 300,
      timestamp: 14000,
    });

    expect(mock.capture).toHaveBeenCalledWith("friction_report_submitted", {
      category: "bug",
      has_screenshot: true,
      page: "/audit",
      session_duration_s: 300,
      timestamp: 14000,
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
    expect(() => trackGoogleSigninAttempt({ timestamp: 0 })).not.toThrow();
    expect(() => trackGoogleSigninSuccess({ timestamp: 0 })).not.toThrow();
    expect(() => trackGoogleSigninError({ error_code: "test", timestamp: 0 })).not.toThrow();
    expect(() => trackEmailVerificationSent({ method: "auto", timestamp: 0 })).not.toThrow();
    expect(() => trackEmailVerificationBlocked({ timestamp: 0 })).not.toThrow();
    expect(() => trackAuditTrigger({ url: "https://x.com", timestamp: 0 })).not.toThrow();
    expect(() => trackResultsView({ audit_id: "x", timestamp: 0 })).not.toThrow();
    expect(() => trackExportClick({ format: "pdf", audit_id: "x" })).not.toThrow();
  });

  it("PERF-141 feedback helpers do not throw when provider is not set", () => {
    expect(() =>
      trackFeedbackSurveyShown({ trigger: "first_audit", page: "/results", timestamp: 0 })
    ).not.toThrow();
    expect(() =>
      trackFeedbackSurveySubmitted({
        trigger: "first_audit",
        q1_value_rating: 4,
        q2_ease_rating: 5,
        q5_nps_score: 8,
        q7_wtp: "49",
        q8_pmf: "very_disappointed",
        has_open_text: true,
        completion_time_ms: 30000,
        page: "/results",
        timestamp: 0,
      })
    ).not.toThrow();
    expect(() =>
      trackFeedbackSurveyDismissed({
        trigger: "first_audit",
        dismiss_type: "close",
        page: "/results",
        timestamp: 0,
      })
    ).not.toThrow();
    expect(() =>
      trackNpsPromptShown({ audit_count: 3, page: "/results", timestamp: 0 })
    ).not.toThrow();
    expect(() =>
      trackNpsScoreSubmitted({
        score: 8,
        category: "passive",
        has_followup: false,
        page: "/results",
        timestamp: 0,
      })
    ).not.toThrow();
    expect(() =>
      trackFrictionReportSubmitted({
        category: "bug",
        has_screenshot: false,
        page: "/audit",
        session_duration_s: 120,
        timestamp: 0,
      })
    ).not.toThrow();
  });
});
