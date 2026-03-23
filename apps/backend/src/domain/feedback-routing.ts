/**
 * Feedback email routing logic — PERF-141.
 *
 * Pure functions that determine whether a feedback document should
 * trigger an email notification. Used by the Cloud Function
 * (functions/src/onFeedbackCreate.ts) and tested in the backend workspace.
 *
 * Design decisions:
 * - D7: Email notifications only for detractors and bugs (high-signal only)
 * - D3: Open-text content is in Firestore only, not PostHog (PII separation)
 */

/* ------------------------------------------------------------------ */
/* Types (lightweight — avoids importing full Zod schemas)             */
/* ------------------------------------------------------------------ */

export interface FeedbackDocumentForRouting {
  readonly id: string;
  readonly userId: string;
  readonly type: "survey" | "nps" | "friction" | "helpfulness";
  readonly page: string;
  readonly createdAt: string;
  readonly payload: NpsPayloadForRouting | FrictionPayloadForRouting | Record<string, unknown>;
  readonly metadata: {
    readonly browser: string;
    readonly viewport: string;
    readonly sessionDurationS: number;
    readonly appVersion: string;
  };
}

export interface NpsPayloadForRouting {
  readonly score: number;
  readonly category: "detractor" | "passive" | "promoter";
  readonly followUp?: string;
}

export interface FrictionPayloadForRouting {
  readonly category: "bug" | "ux_confusion" | "missing_feature" | "performance" | "other";
  readonly description: string;
  readonly userAction?: string;
  readonly screenshotUrl?: string;
}

/* ------------------------------------------------------------------ */
/* Email configuration                                                 */
/* ------------------------------------------------------------------ */

const TEAM_EMAIL = "team@lumosee.com";

/* ------------------------------------------------------------------ */
/* Email notification type                                             */
/* ------------------------------------------------------------------ */

export interface EmailNotification {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/* ------------------------------------------------------------------ */
/* Email content builders (pure functions)                              */
/* ------------------------------------------------------------------ */

export function buildNpsDetractorEmail(
  doc: FeedbackDocumentForRouting,
  payload: NpsPayloadForRouting
): { subject: string; body: string } {
  return {
    subject: `[NimbleVitals] NPS Detractor Alert — Score ${String(payload.score)}`,
    body: [
      `NPS Detractor Alert`,
      ``,
      `User ID: ${doc.userId}`,
      `Score: ${String(payload.score)} / 10`,
      `Category: ${payload.category}`,
      `Follow-up: ${payload.followUp ?? "(none)"}`,
      `Page: ${doc.page}`,
      `Timestamp: ${doc.createdAt}`,
    ].join("\n"),
  };
}

export function buildBugReportEmail(
  doc: FeedbackDocumentForRouting,
  payload: FrictionPayloadForRouting
): { subject: string; body: string } {
  return {
    subject: `[NimbleVitals] Bug Report from Pilot User`,
    body: [
      `Bug Report`,
      ``,
      `User ID: ${doc.userId}`,
      `Category: ${payload.category}`,
      `Description: ${payload.description}`,
      `User Action: ${payload.userAction ?? "(not provided)"}`,
      `Screenshot: ${payload.screenshotUrl ?? "(none)"}`,
      `Page: ${doc.page}`,
      `Timestamp: ${doc.createdAt}`,
    ].join("\n"),
  };
}

/* ------------------------------------------------------------------ */
/* Routing logic (pure function — testable without Firebase SDK)       */
/* ------------------------------------------------------------------ */

/**
 * Determine if a feedback document should trigger an email notification.
 * Returns the email notification to send, or null if no email is needed.
 *
 * Rules (per pilot-feedback-mechanism.md §4.4):
 * - NPS score 0-6 (detractor): Email to team@lumosee.com
 * - Friction report with category "bug": Email to team@lumosee.com
 */
export function routeFeedbackToEmail(doc: FeedbackDocumentForRouting): EmailNotification | null {
  if (doc.type === "nps") {
    const payload = doc.payload as NpsPayloadForRouting;
    if (payload.score <= 6) {
      const email = buildNpsDetractorEmail(doc, payload);
      return { to: TEAM_EMAIL, ...email };
    }
  }

  if (doc.type === "friction") {
    const payload = doc.payload as FrictionPayloadForRouting;
    if (payload.category === "bug") {
      const email = buildBugReportEmail(doc, payload);
      return { to: TEAM_EMAIL, ...email };
    }
  }

  return null;
}
