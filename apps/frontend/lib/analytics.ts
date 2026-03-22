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

/** ADR-002 telemetry event names (exhaustive). */
export type TelemetryEvent =
  | "page_view"
  | "login_attempt"
  | "signup_attempt"
  | "email_verification_sent"
  | "email_verification_blocked"
  | "audit_trigger"
  | "results_view"
  | "export_click";

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
