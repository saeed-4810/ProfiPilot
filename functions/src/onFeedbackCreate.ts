/**
 * Cloud Function: onFeedbackCreate — PERF-141 / PERF-162
 *
 * Firestore onCreate trigger on the `feedback` collection.
 * Routes urgent feedback to team@lumosee.com via email:
 *
 * - NPS detractor (score <= 6): Immediate email alert
 * - Friction report with category "bug": Immediate email alert
 *
 * Email delivery: Uses Firestore `mail` collection with Firebase Extensions
 * "Trigger Email from Firestore" (firebase/firestore-send-email).
 * Alternative: Replace writeEmailToFirestore() with SendGrid API call.
 *
 * Design decisions:
 * - D7: Email notifications only for detractors and bugs (high-signal only)
 * - D3: Open-text content is in Firestore only, not PostHog (PII separation)
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface FeedbackDocument {
  id: string;
  userId: string;
  type: "survey" | "nps" | "friction" | "helpfulness";
  page: string;
  createdAt: string;
  payload: NpsPayload | FrictionPayload | Record<string, unknown>;
  metadata: {
    browser: string;
    viewport: string;
    sessionDurationS: number;
    appVersion: string;
  };
}

export interface NpsPayload {
  score: number;
  category: "detractor" | "passive" | "promoter";
  followUp?: string;
}

export interface FrictionPayload {
  category: "bug" | "ux_confusion" | "missing_feature" | "performance" | "other";
  description: string;
  userAction?: string;
  screenshotUrl?: string;
}

/* ------------------------------------------------------------------ */
/* Email configuration                                                 */
/* ------------------------------------------------------------------ */

const TEAM_EMAIL = "team@lumosee.com";

/* ------------------------------------------------------------------ */
/* Email content builders (pure functions — exported for testing)       */
/* ------------------------------------------------------------------ */

export function buildNpsDetractorEmail(
  doc: FeedbackDocument,
  payload: NpsPayload
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
  doc: FeedbackDocument,
  payload: FrictionPayload
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
/* Routing logic (pure function)                                       */
/* ------------------------------------------------------------------ */

export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
}

/**
 * Determine if a feedback document should trigger an email notification.
 * Returns the email notification to send, or null if no email is needed.
 *
 * Rules (per pilot-feedback-mechanism.md §4.4):
 * - NPS score 0-6 (detractor): Email to team@lumosee.com
 * - Friction report with category "bug": Email to team@lumosee.com
 */
export function routeFeedbackToEmail(doc: FeedbackDocument): EmailNotification | null {
  if (doc.type === "nps") {
    const payload = doc.payload as NpsPayload;
    if (payload.score <= 6) {
      const email = buildNpsDetractorEmail(doc, payload);
      return { to: TEAM_EMAIL, ...email };
    }
  }

  if (doc.type === "friction") {
    const payload = doc.payload as FrictionPayload;
    if (payload.category === "bug") {
      const email = buildBugReportEmail(doc, payload);
      return { to: TEAM_EMAIL, ...email };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Email delivery via Firestore (Firebase Extensions: Trigger Email)    */
/* ------------------------------------------------------------------ */

/**
 * Write an email document to the `mail` collection.
 * Firebase Extensions "Trigger Email from Firestore" picks it up and sends via SMTP/SendGrid.
 *
 * If not using Firebase Extensions, replace this with a direct SendGrid API call.
 */
async function writeEmailToFirestore(notification: EmailNotification): Promise<void> {
  await admin
    .firestore()
    .collection("mail")
    .add({
      to: notification.to,
      message: {
        subject: notification.subject,
        text: notification.body,
      },
    });
}

/* ------------------------------------------------------------------ */
/* Cloud Function handler                                              */
/* ------------------------------------------------------------------ */

export const onFeedbackCreate = onDocumentCreated("feedback/{docId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn("onFeedbackCreate: No data in event");
    return;
  }

  const doc = snapshot.data() as FeedbackDocument;
  const docId = event.params.docId;

  logger.info("Feedback received", {
    docId,
    type: doc.type,
    userId: doc.userId,
    page: doc.page,
  });

  const notification = routeFeedbackToEmail(doc);
  if (!notification) {
    return;
  }

  logger.info("Sending email notification", {
    docId,
    to: notification.to,
    subject: notification.subject,
  });

  await writeEmailToFirestore(notification);
});
