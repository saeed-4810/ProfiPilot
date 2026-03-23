/**
 * Cloud Function: onFeedbackCreate — Unit Tests (PERF-162)
 *
 * Tests the email routing logic and content builders for the
 * onFeedbackCreate Cloud Function.
 *
 * Note: The Cloud Function handler itself (Firestore trigger + email write)
 * is tested via the exported pure functions. Integration testing with the
 * Firestore emulator is deferred to staging deployment.
 *
 * Scenario IDs:
 *   T-PERF-162-001: routeFeedbackToEmail routes NPS detractors to email
 *   T-PERF-162-002: routeFeedbackToEmail routes bug friction reports to email
 *   T-PERF-162-003: routeFeedbackToEmail does NOT route non-urgent feedback
 *   T-PERF-162-004: buildNpsDetractorEmail produces correct email content
 *   T-PERF-162-005: buildBugReportEmail produces correct email content
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Firebase mocks (must be before dynamic import) ---
const mockAdd = vi.fn().mockResolvedValue({ id: "mail-123" });
const mockFirestore = {
  collection: vi.fn(() => ({ add: mockAdd })),
};

vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(),
    firestore: () => mockFirestore,
  },
  initializeApp: vi.fn(),
  firestore: () => mockFirestore,
}));

// Capture the handler passed to onDocumentCreated
let capturedHandler: ((event: unknown) => Promise<void>) | undefined;

vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentCreated: vi.fn((_path: string, handler: (event: unknown) => Promise<void>) => {
    capturedHandler = handler;
    return handler;
  }),
}));

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

// Dynamic import after mocks
const { routeFeedbackToEmail, buildNpsDetractorEmail, buildBugReportEmail } =
  await import("../src/onFeedbackCreate");
import type { FeedbackDocument, NpsPayload } from "../src/onFeedbackCreate";

beforeEach(() => {
  vi.clearAllMocks();
  mockAdd.mockResolvedValue({ id: "mail-123" });
});

/* ------------------------------------------------------------------ */
/* Test data factories                                                 */
/* ------------------------------------------------------------------ */

function createFeedbackDoc(
  overrides: Partial<FeedbackDocument> & Pick<FeedbackDocument, "type" | "payload">
): FeedbackDocument {
  return {
    id: "feedback-123",
    userId: "user-456",
    page: "/results",
    createdAt: "2026-03-20T10:00:00.000Z",
    metadata: {
      browser: "Chrome 124",
      viewport: "1440x900",
      sessionDurationS: 120,
      appVersion: "0.1.0",
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* T-PERF-162-001: NPS detractor routing                               */
/* ------------------------------------------------------------------ */

describe("T-PERF-162-001: routeFeedbackToEmail — NPS detractors", () => {
  it("routes NPS score 0 (minimum detractor) to email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 0, category: "detractor" },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).not.toBeNull();
    expect(result?.to).toBe("team@lumosee.com");
  });

  it("routes NPS score 4 to email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 4, category: "detractor", followUp: "Needs work" },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).not.toBeNull();
    expect(result?.subject).toContain("Score 4");
  });

  it("routes NPS score 6 (boundary detractor) to email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 6, category: "detractor" },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).not.toBeNull();
  });

  it("does NOT route NPS score 7 (passive) to email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 7, category: "passive" },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).toBeNull();
  });

  it("does NOT route NPS score 9 (promoter) to email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 9, category: "promoter" },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).toBeNull();
  });

  it("does NOT route NPS score 10 (max promoter) to email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 10, category: "promoter" },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-162-002: Bug friction report routing                         */
/* ------------------------------------------------------------------ */

describe("T-PERF-162-002: routeFeedbackToEmail — bug friction reports", () => {
  it("routes friction report with category 'bug' to email", () => {
    const doc = createFeedbackDoc({
      type: "friction",
      payload: {
        category: "bug",
        description: "Export button broken on mobile viewport",
      },
    });
    const result = routeFeedbackToEmail(doc);
    expect(result).not.toBeNull();
    expect(result?.to).toBe("team@lumosee.com");
    expect(result?.subject).toContain("Bug Report");
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-162-003: Non-urgent feedback NOT routed                      */
/* ------------------------------------------------------------------ */

describe("T-PERF-162-003: routeFeedbackToEmail — non-urgent feedback", () => {
  it("does NOT route friction 'ux_confusion' to email", () => {
    const doc = createFeedbackDoc({
      type: "friction",
      payload: {
        category: "ux_confusion",
        description: "Navigation menu is confusing on mobile",
      },
    });
    expect(routeFeedbackToEmail(doc)).toBeNull();
  });

  it("does NOT route friction 'missing_feature' to email", () => {
    const doc = createFeedbackDoc({
      type: "friction",
      payload: {
        category: "missing_feature",
        description: "Would like PDF export support for reports",
      },
    });
    expect(routeFeedbackToEmail(doc)).toBeNull();
  });

  it("does NOT route friction 'performance' to email", () => {
    const doc = createFeedbackDoc({
      type: "friction",
      payload: {
        category: "performance",
        description: "The audit page takes too long to load",
      },
    });
    expect(routeFeedbackToEmail(doc)).toBeNull();
  });

  it("does NOT route friction 'other' to email", () => {
    const doc = createFeedbackDoc({
      type: "friction",
      payload: {
        category: "other",
        description: "General feedback about the product",
      },
    });
    expect(routeFeedbackToEmail(doc)).toBeNull();
  });

  it("does NOT route survey feedback to email", () => {
    const doc = createFeedbackDoc({
      type: "survey",
      payload: {
        trigger: "first_audit",
        responses: {
          q1_value_rating: 4,
          q2_ease_rating: 5,
          q5_nps_score: 8,
          q7_wtp: "49",
          q8_pmf: "very_disappointed",
        },
        completionTimeMs: 30000,
      },
    });
    expect(routeFeedbackToEmail(doc)).toBeNull();
  });

  it("does NOT route helpfulness feedback to email", () => {
    const doc = createFeedbackDoc({
      type: "helpfulness",
      payload: { helpful: true, sectionId: "recommendations" },
    });
    expect(routeFeedbackToEmail(doc)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-162-004: NPS detractor email content                         */
/* ------------------------------------------------------------------ */

describe("T-PERF-162-004: buildNpsDetractorEmail", () => {
  it("includes all required fields in email", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 3, category: "detractor", followUp: "Too slow" },
    });
    const payload = doc.payload as NpsPayload;
    const email = buildNpsDetractorEmail(doc, payload);

    expect(email.subject).toBe("[NimbleVitals] NPS Detractor Alert — Score 3");
    expect(email.body).toContain("User ID: user-456");
    expect(email.body).toContain("Score: 3 / 10");
    expect(email.body).toContain("Category: detractor");
    expect(email.body).toContain("Follow-up: Too slow");
    expect(email.body).toContain("Page: /results");
    expect(email.body).toContain("Timestamp: 2026-03-20T10:00:00.000Z");
  });

  it("handles missing followUp gracefully", () => {
    const doc = createFeedbackDoc({
      type: "nps",
      payload: { score: 2, category: "detractor" },
    });
    const payload = doc.payload as NpsPayload;
    const email = buildNpsDetractorEmail(doc, payload);

    expect(email.body).toContain("Follow-up: (none)");
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-162-005: Bug report email content                            */
/* ------------------------------------------------------------------ */

describe("T-PERF-162-005: buildBugReportEmail", () => {
  it("includes all required fields in email", () => {
    const payload = {
      category: "bug" as const,
      description: "The export button does not respond when clicked",
      userAction: "Trying to export report",
      screenshotUrl: "feedback-screenshots/user-123/abc.png",
    };
    const doc = createFeedbackDoc({ type: "friction", payload });
    const email = buildBugReportEmail(doc, payload);

    expect(email.subject).toBe("[NimbleVitals] Bug Report from Pilot User");
    expect(email.body).toContain("User ID: user-456");
    expect(email.body).toContain("Category: bug");
    expect(email.body).toContain("Description: The export button does not respond");
    expect(email.body).toContain("User Action: Trying to export report");
    expect(email.body).toContain("Screenshot: feedback-screenshots/user-123/abc.png");
  });

  it("handles missing optional fields gracefully", () => {
    const payload = {
      category: "bug" as const,
      description: "Something is broken in the audit flow",
    };
    const doc = createFeedbackDoc({ type: "friction", payload });
    const email = buildBugReportEmail(doc, payload);

    expect(email.body).toContain("User Action: (not provided)");
    expect(email.body).toContain("Screenshot: (none)");
  });
});

/* ------------------------------------------------------------------ */
/* Cloud Function handler integration tests                            */
/* ------------------------------------------------------------------ */

describe("onFeedbackCreate Cloud Function handler", () => {
  it("handler was registered via onDocumentCreated", () => {
    expect(capturedHandler).toBeDefined();
  });

  it("writes email to Firestore mail collection for NPS detractor", async () => {
    const event = {
      data: {
        data: () => ({
          id: "fb-1",
          userId: "user-1",
          type: "nps",
          page: "/results",
          createdAt: "2026-03-20T10:00:00.000Z",
          payload: { score: 3, category: "detractor", followUp: "Bad" },
          metadata: {
            browser: "Chrome",
            viewport: "1440x900",
            sessionDurationS: 60,
            appVersion: "0.1.0",
          },
        }),
        id: "fb-1",
        ref: {},
      },
      params: { docId: "fb-1" },
    };

    await capturedHandler!(event);

    expect(mockFirestore.collection).toHaveBeenCalledWith("mail");
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith({
      to: "team@lumosee.com",
      message: {
        subject: expect.stringContaining("NPS Detractor Alert"),
        text: expect.stringContaining("Score: 3 / 10"),
      },
    });
  });

  it("writes email to Firestore mail collection for bug friction report", async () => {
    const event = {
      data: {
        data: () => ({
          id: "fb-2",
          userId: "user-2",
          type: "friction",
          page: "/audit",
          createdAt: "2026-03-20T11:00:00.000Z",
          payload: { category: "bug", description: "Button broken" },
          metadata: {
            browser: "Firefox",
            viewport: "1920x1080",
            sessionDurationS: 90,
            appVersion: "0.1.0",
          },
        }),
        id: "fb-2",
        ref: {},
      },
      params: { docId: "fb-2" },
    };

    await capturedHandler!(event);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith({
      to: "team@lumosee.com",
      message: {
        subject: expect.stringContaining("Bug Report"),
        text: expect.stringContaining("Button broken"),
      },
    });
  });

  it("does NOT write email for non-urgent feedback (survey)", async () => {
    const event = {
      data: {
        data: () => ({
          id: "fb-3",
          userId: "user-3",
          type: "survey",
          page: "/results",
          createdAt: "2026-03-20T12:00:00.000Z",
          payload: { trigger: "first_audit", responses: {}, completionTimeMs: 30000 },
          metadata: {
            browser: "Chrome",
            viewport: "1440x900",
            sessionDurationS: 120,
            appVersion: "0.1.0",
          },
        }),
        id: "fb-3",
        ref: {},
      },
      params: { docId: "fb-3" },
    };

    await capturedHandler!(event);

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("does NOT write email for NPS promoter (score 9)", async () => {
    const event = {
      data: {
        data: () => ({
          id: "fb-4",
          userId: "user-4",
          type: "nps",
          page: "/results",
          createdAt: "2026-03-20T13:00:00.000Z",
          payload: { score: 9, category: "promoter" },
          metadata: {
            browser: "Chrome",
            viewport: "1440x900",
            sessionDurationS: 60,
            appVersion: "0.1.0",
          },
        }),
        id: "fb-4",
        ref: {},
      },
      params: { docId: "fb-4" },
    };

    await capturedHandler!(event);

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("handles missing event data gracefully", async () => {
    const event = {
      data: undefined,
      params: { docId: "fb-5" },
    };

    await capturedHandler!(event);

    expect(mockAdd).not.toHaveBeenCalled();
  });
});
