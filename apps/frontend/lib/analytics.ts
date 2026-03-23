/**
 * Analytics abstraction layer — PERF-122.
 *
 * Wraps PostHog (posthog-js) behind a provider-agnostic interface.
 * All app components import from this module, never from posthog-js directly.
 *
 * Design:
 * - Dependency injection: provider is injected, not imported at module scope.
 * - Pure event formatting: formatEventProperties is a pure function.
 * - No PII: events contain only anonymous IDs, page paths, and action names.
 *
 * ADR-002 Telemetry Contract events:
 *   page_view, login_attempt, audit_trigger, results_view, export_click
 *
 * T-PERF-122-007: Typed wrappers for all 5 ADR-002 events.
 * T-PERF-122-008: No hardcoded API keys — loaded from env vars.
 * P-PERF-122-002: No PII in analytics events.
 */

import type posthog from "posthog-js";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Minimal analytics provider interface for dependency injection. */
export interface AnalyticsProvider {
  readonly capture: (eventName: string, properties?: Record<string, unknown>) => void;
}

/** ADR-002 telemetry event names + PERF-141 feedback events (exhaustive). */
export type TelemetryEvent =
  | "page_view"
  | "login_attempt"
  | "signup_attempt"
  | "google_signin_attempt"
  | "google_signin_success"
  | "google_signin_error"
  | "email_verification_sent"
  | "email_verification_blocked"
  | "audit_trigger"
  | "results_view"
  | "export_click"
  | "feedback_survey_shown"
  | "feedback_survey_submitted"
  | "feedback_survey_dismissed"
  | "nps_prompt_shown"
  | "nps_score_submitted"
  | "friction_report_submitted";

/** Payload for page_view event. */
export interface PageViewPayload {
  readonly route: string;
  readonly timestamp: number;
}

/** Payload for login_attempt event. */
export interface LoginAttemptPayload {
  readonly method: string;
  readonly timestamp: number;
}

/** Payload for signup_attempt event. */
export interface SignupAttemptPayload {
  readonly method: string;
  readonly timestamp: number;
}

/** Payload for google_signin_attempt event. */
export interface GoogleSigninAttemptPayload {
  readonly timestamp: number;
}

/** Payload for google_signin_success event. */
export interface GoogleSigninSuccessPayload {
  readonly timestamp: number;
}

/** Payload for google_signin_error event. */
export interface GoogleSigninErrorPayload {
  readonly error_code: string;
  readonly timestamp: number;
}

/** Payload for email_verification_sent event. */
export interface EmailVerificationSentPayload {
  readonly method: "auto" | "resend";
  readonly timestamp: number;
}

/** Payload for email_verification_blocked event. */
export interface EmailVerificationBlockedPayload {
  readonly timestamp: number;
}

/** Payload for audit_trigger event. */
export interface AuditTriggerPayload {
  readonly url: string;
  readonly timestamp: number;
}

/** Payload for results_view event. */
export interface ResultsViewPayload {
  readonly audit_id: string;
  readonly timestamp: number;
}

/** Payload for export_click event. */
export interface ExportClickPayload {
  readonly format: string;
  readonly audit_id: string;
}

/* ------------------------------------------------------------------ */
/* PERF-141: Feedback event payloads                                   */
/* No open-text content in PostHog payloads (PII separation per D3).  */
/* ------------------------------------------------------------------ */

/** Payload for feedback_survey_shown event. */
export interface FeedbackSurveyShownPayload {
  readonly trigger: string;
  readonly page: string;
  readonly timestamp: number;
}

/** Payload for feedback_survey_submitted event. */
export interface FeedbackSurveySubmittedPayload {
  readonly trigger: string;
  readonly q1_value_rating: number;
  readonly q2_ease_rating: number;
  readonly q5_nps_score: number;
  readonly q7_wtp: string;
  readonly q8_pmf: string;
  readonly has_open_text: boolean;
  readonly completion_time_ms: number;
  readonly page: string;
  readonly timestamp: number;
}

/** Payload for feedback_survey_dismissed event. */
export interface FeedbackSurveyDismissedPayload {
  readonly trigger: string;
  readonly dismiss_type: string;
  readonly page: string;
  readonly timestamp: number;
}

/** Payload for nps_prompt_shown event. */
export interface NpsPromptShownPayload {
  readonly audit_count: number;
  readonly page: string;
  readonly timestamp: number;
}

/** Payload for nps_score_submitted event. */
export interface NpsScoreSubmittedPayload {
  readonly score: number;
  readonly category: string;
  readonly has_followup: boolean;
  readonly page: string;
  readonly timestamp: number;
}

/** Payload for friction_report_submitted event. */
export interface FrictionReportSubmittedPayload {
  readonly category: string;
  readonly has_screenshot: boolean;
  readonly page: string;
  readonly session_duration_s: number;
  readonly timestamp: number;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Format event properties into a flat record for the analytics provider.
 * Pure function — no side effects.
 *
 * P-PERF-122-002: Strips any field named "email", "name", "uid", or "token"
 * to prevent accidental PII leakage.
 */
const PII_FIELDS: ReadonlySet<string> = new Set(["email", "name", "uid", "token", "password"]);

export function formatEventProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!PII_FIELDS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Analytics client                                                    */
/* ------------------------------------------------------------------ */

/** Singleton analytics provider reference. */
let provider: AnalyticsProvider | null = null;

/**
 * Set the analytics provider (called once during app initialization).
 * T-PERF-122-001: Provider is set after PostHog SDK initializes.
 */
export function setAnalyticsProvider(p: AnalyticsProvider): void {
  provider = p;
}

/**
 * Get the current analytics provider (for testing/inspection).
 */
export function getAnalyticsProvider(): AnalyticsProvider | null {
  return provider;
}

/**
 * Reset the analytics provider (for testing only).
 */
export function resetAnalyticsProvider(): void {
  provider = null;
}

/**
 * Generic track function — sends an event to the analytics provider.
 * No-ops silently if no provider is set (graceful degradation).
 *
 * T-PERF-122-002: PP.track('page_view') sends event to analytics backend.
 */
export function track(eventName: string, properties: Record<string, unknown> = {}): void {
  if (provider === null) {
    return;
  }
  provider.capture(eventName, formatEventProperties(properties));
}

/* ------------------------------------------------------------------ */
/* Typed event helpers (ADR-002 Telemetry Contract)                    */
/* ------------------------------------------------------------------ */

/** T-PERF-122-007: page_view — fires on route change. */
export function trackPageView(payload: PageViewPayload): void {
  track("page_view", { ...payload });
}

/** T-PERF-122-007: login_attempt — fires on login button click. */
export function trackLoginAttempt(payload: LoginAttemptPayload): void {
  track("login_attempt", { ...payload });
}

/** T-PERF-137-001: signup_attempt — fires on signup button click. */
export function trackSignupAttempt(payload: SignupAttemptPayload): void {
  track("signup_attempt", { ...payload });
}

/** T-PERF-139-001: google_signin_attempt — fires on "Continue with Google" click. */
export function trackGoogleSigninAttempt(payload: GoogleSigninAttemptPayload): void {
  track("google_signin_attempt", { ...payload });
}

/** T-PERF-139-001: google_signin_success — fires on successful Google auth. */
export function trackGoogleSigninSuccess(payload: GoogleSigninSuccessPayload): void {
  track("google_signin_success", { ...payload });
}

/** T-PERF-139-002: google_signin_error — fires on Google auth error. */
export function trackGoogleSigninError(payload: GoogleSigninErrorPayload): void {
  track("google_signin_error", { ...payload });
}

/** T-PERF-138-002: email_verification_sent — fires after signup and on resend. */
export function trackEmailVerificationSent(payload: EmailVerificationSentPayload): void {
  track("email_verification_sent", { ...payload });
}

/** T-PERF-138-001: email_verification_blocked — fires on login with unverified email. */
export function trackEmailVerificationBlocked(payload: EmailVerificationBlockedPayload): void {
  track("email_verification_blocked", { ...payload });
}

/** T-PERF-122-007: audit_trigger — fires on audit form submit. */
export function trackAuditTrigger(payload: AuditTriggerPayload): void {
  track("audit_trigger", { ...payload });
}

/** T-PERF-122-007: results_view — fires on results page load. */
export function trackResultsView(payload: ResultsViewPayload): void {
  track("results_view", { ...payload });
}

/** T-PERF-122-007: export_click — fires on export button click. */
export function trackExportClick(payload: ExportClickPayload): void {
  track("export_click", { ...payload });
}

/* ------------------------------------------------------------------ */
/* PERF-141: Feedback event helpers                                    */
/* No open-text content in PostHog payloads (PII separation per D3).  */
/* ------------------------------------------------------------------ */

/** T-PERF-141-001: feedback_survey_shown — fires when survey panel appears. */
export function trackFeedbackSurveyShown(payload: FeedbackSurveyShownPayload): void {
  track("feedback_survey_shown", { ...payload });
}

/** T-PERF-141-002: feedback_survey_submitted — fires on survey submit. */
export function trackFeedbackSurveySubmitted(payload: FeedbackSurveySubmittedPayload): void {
  track("feedback_survey_submitted", { ...payload });
}

/** T-PERF-141-003: feedback_survey_dismissed — fires on survey dismiss. */
export function trackFeedbackSurveyDismissed(payload: FeedbackSurveyDismissedPayload): void {
  track("feedback_survey_dismissed", { ...payload });
}

/** T-PERF-141-004: nps_prompt_shown — fires when NPS toast appears. */
export function trackNpsPromptShown(payload: NpsPromptShownPayload): void {
  track("nps_prompt_shown", { ...payload });
}

/** T-PERF-141-005: nps_score_submitted — fires on NPS score submit. */
export function trackNpsScoreSubmitted(payload: NpsScoreSubmittedPayload): void {
  track("nps_score_submitted", { ...payload });
}

/** T-PERF-141-006: friction_report_submitted — fires on friction report submit. */
export function trackFrictionReportSubmitted(payload: FrictionReportSubmittedPayload): void {
  track("friction_report_submitted", { ...payload });
}

/* ------------------------------------------------------------------ */
/* PostHog adapter                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create an AnalyticsProvider from a PostHog instance.
 * Adapts posthog.capture() to the AnalyticsProvider interface.
 */
export function createPostHogProvider(
  posthogInstance: Pick<typeof posthog, "capture">
): AnalyticsProvider {
  return {
    capture: (eventName: string, properties?: Record<string, unknown>) => {
      posthogInstance.capture(eventName, properties);
    },
  };
}
