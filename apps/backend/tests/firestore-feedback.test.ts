/**
 * Firestore Feedback Adapter — Unit Tests (PERF-141)
 *
 * Tests the feedback adapter (src/adapters/firestore-feedback.ts) and
 * domain schemas (src/domain/feedback.ts) for the pilot feedback mechanism.
 *
 * Scenario IDs:
 *   T-PERF-141-001: createFeedback writes document with correct shape
 *   T-PERF-141-002: getFeedbackPreferences returns validated preferences
 *   T-PERF-141-003: getFeedbackPreferences returns null for missing doc
 *   T-PERF-141-004: getFeedbackPreferences returns null for invalid data
 *   T-PERF-141-005: updateFeedbackPreferences writes and returns preferences
 *   T-PERF-141-006: Zod schemas validate correct payloads
 *   T-PERF-141-007: Zod schemas reject invalid payloads
 *   T-PERF-141-008: Cloud Function routing logic (email notifications)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Firebase Admin mock ---
const mockSet = vi.fn();
const mockGet = vi.fn();

const mockFirestore = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      set: mockSet,
      get: mockGet,
    })),
  })),
};

vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(() => ({
      name: "mock-app",
      auth: () => ({
        verifyIdToken: vi.fn(),
        createSessionCookie: vi.fn(),
        verifySessionCookie: vi.fn(),
        revokeRefreshTokens: vi.fn(),
      }),
      firestore: () => mockFirestore,
    })),
    credential: {
      cert: vi.fn(() => "mock-cert"),
      applicationDefault: vi.fn(() => "mock-adc"),
    },
  },
}));

// --- Imports (after mocks) ---
const { createFeedback, getFeedbackPreferences, updateFeedbackPreferences } =
  await import("../src/adapters/firestore-feedback.js");

const {
  SurveyPayloadSchema,
  NpsPayloadSchema,
  FrictionPayloadSchema,
  HelpfulnessPayloadSchema,
  FeedbackDocumentSchema,
  FeedbackPreferencesSchema,
  FeedbackMetadataSchema,
  FeedbackType,
  SurveyTrigger,
  NpsCategory,
  FrictionCategory,
} = await import("../src/domain/feedback.js");

// --- Feedback email routing logic (domain layer, used by Cloud Function) ---
const { routeFeedbackToEmail, buildNpsDetractorEmail, buildBugReportEmail } =
  await import("../src/domain/feedback-routing.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/* Test data factories                                                 */
/* ------------------------------------------------------------------ */

function createSurveyPayload() {
  return {
    trigger: "first_audit" as const,
    responses: {
      q1_value_rating: 4,
      q2_ease_rating: 5,
      q3_missing_feature: "PDF export",
      q4_friction: undefined,
      q5_nps_score: 8,
      q6_competitive_comparison: "Better than Lighthouse CLI",
      q7_wtp: "49",
      q8_pmf: "very_disappointed" as const,
    },
    completionTimeMs: 45000,
  };
}

function createNpsPayload() {
  return {
    score: 4,
    category: "detractor" as const,
    followUp: "Needs more features",
  };
}

function createFrictionPayload() {
  return {
    category: "bug" as const,
    description: "The export button does not respond when clicked on mobile viewport",
    userAction: "Trying to export report",
    screenshotUrl: "feedback-screenshots/user-123/abc.png",
  };
}

function createHelpfulnessPayload() {
  return {
    helpful: true,
    sectionId: "recommendations",
  };
}

function createMetadata() {
  return {
    browser: "Chrome 124",
    viewport: "1440x900",
    sessionDurationS: 120,
    appVersion: "0.1.0",
  };
}

function createPreferences() {
  return {
    userId: "user-123",
    surveyDismissals: {
      first_audit: {
        count: 1,
        permanent: false,
        lastDismissedAt: "2026-03-20T10:00:00.000Z",
      },
    },
    npsHistory: {
      count: 2,
      lastShownAt: "2026-03-19T14:00:00.000Z",
    },
    lastPromptSessionId: "session-abc",
  };
}

/* ------------------------------------------------------------------ */
/* Domain type constants                                               */
/* ------------------------------------------------------------------ */

describe("Domain type constants", () => {
  it("FeedbackType has correct values", () => {
    expect(FeedbackType.SURVEY).toBe("survey");
    expect(FeedbackType.NPS).toBe("nps");
    expect(FeedbackType.FRICTION).toBe("friction");
    expect(FeedbackType.HELPFULNESS).toBe("helpfulness");
  });

  it("SurveyTrigger has correct values", () => {
    expect(SurveyTrigger.FIRST_AUDIT).toBe("first_audit");
    expect(SurveyTrigger.THIRD_SESSION).toBe("third_session");
    expect(SurveyTrigger.FIRST_EXPORT).toBe("first_export");
  });

  it("NpsCategory has correct values", () => {
    expect(NpsCategory.DETRACTOR).toBe("detractor");
    expect(NpsCategory.PASSIVE).toBe("passive");
    expect(NpsCategory.PROMOTER).toBe("promoter");
  });

  it("FrictionCategory has correct values", () => {
    expect(FrictionCategory.BUG).toBe("bug");
    expect(FrictionCategory.UX_CONFUSION).toBe("ux_confusion");
    expect(FrictionCategory.MISSING_FEATURE).toBe("missing_feature");
    expect(FrictionCategory.PERFORMANCE).toBe("performance");
    expect(FrictionCategory.OTHER).toBe("other");
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-006: Zod schemas validate correct payloads               */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-006: Zod schemas validate correct payloads", () => {
  it("SurveyPayloadSchema accepts valid survey payload", () => {
    const result = SurveyPayloadSchema.safeParse(createSurveyPayload());
    expect(result.success).toBe(true);
  });

  it("SurveyPayloadSchema accepts payload without optional fields", () => {
    const payload = {
      trigger: "third_session",
      responses: {
        q1_value_rating: 3,
        q2_ease_rating: 4,
        q5_nps_score: 7,
        q7_wtp: "free",
        q8_pmf: "somewhat_disappointed",
      },
      completionTimeMs: 30000,
    };
    const result = SurveyPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("NpsPayloadSchema accepts valid NPS payload", () => {
    const result = NpsPayloadSchema.safeParse(createNpsPayload());
    expect(result.success).toBe(true);
  });

  it("NpsPayloadSchema accepts payload without optional followUp", () => {
    const result = NpsPayloadSchema.safeParse({ score: 9, category: "promoter" });
    expect(result.success).toBe(true);
  });

  it("FrictionPayloadSchema accepts valid friction payload", () => {
    const result = FrictionPayloadSchema.safeParse(createFrictionPayload());
    expect(result.success).toBe(true);
  });

  it("FrictionPayloadSchema accepts payload without optional fields", () => {
    const result = FrictionPayloadSchema.safeParse({
      category: "ux_confusion",
      description: "The navigation menu is confusing on mobile",
    });
    expect(result.success).toBe(true);
  });

  it("HelpfulnessPayloadSchema accepts valid helpfulness payload", () => {
    const result = HelpfulnessPayloadSchema.safeParse(createHelpfulnessPayload());
    expect(result.success).toBe(true);
  });

  it("HelpfulnessPayloadSchema accepts payload with comment", () => {
    const result = HelpfulnessPayloadSchema.safeParse({
      helpful: false,
      comment: "Missing context about CLS",
      sectionId: "recommendations",
    });
    expect(result.success).toBe(true);
  });

  it("FeedbackMetadataSchema accepts valid metadata", () => {
    const result = FeedbackMetadataSchema.safeParse(createMetadata());
    expect(result.success).toBe(true);
  });

  it("FeedbackDocumentSchema accepts valid feedback document", () => {
    const doc = {
      id: "abc-123",
      userId: "user-456",
      type: "survey",
      page: "/results",
      createdAt: "2026-03-20T10:00:00.000Z",
      payload: createSurveyPayload(),
      metadata: createMetadata(),
    };
    const result = FeedbackDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("FeedbackPreferencesSchema accepts valid preferences", () => {
    const result = FeedbackPreferencesSchema.safeParse(createPreferences());
    expect(result.success).toBe(true);
  });

  it("FeedbackPreferencesSchema accepts preferences without optional lastPromptSessionId", () => {
    const prefs = {
      userId: "user-123",
      surveyDismissals: {},
      npsHistory: { count: 0, lastShownAt: "2026-03-20T10:00:00.000Z" },
    };
    const result = FeedbackPreferencesSchema.safeParse(prefs);
    expect(result.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-007: Zod schemas reject invalid payloads                 */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-007: Zod schemas reject invalid payloads", () => {
  it("SurveyPayloadSchema rejects invalid trigger", () => {
    const payload = { ...createSurveyPayload(), trigger: "invalid_trigger" };
    const result = SurveyPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("SurveyPayloadSchema rejects q1_value_rating out of range", () => {
    const payload = createSurveyPayload();
    payload.responses.q1_value_rating = 6;
    const result = SurveyPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("SurveyPayloadSchema rejects q5_nps_score out of range", () => {
    const payload = createSurveyPayload();
    payload.responses.q5_nps_score = 11;
    const result = SurveyPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("SurveyPayloadSchema rejects invalid q8_pmf value", () => {
    const payload = createSurveyPayload();
    (payload.responses as Record<string, unknown>).q8_pmf = "invalid";
    const result = SurveyPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("SurveyPayloadSchema rejects negative completionTimeMs", () => {
    const payload = { ...createSurveyPayload(), completionTimeMs: -1 };
    const result = SurveyPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("NpsPayloadSchema rejects score below 0", () => {
    const result = NpsPayloadSchema.safeParse({ score: -1, category: "detractor" });
    expect(result.success).toBe(false);
  });

  it("NpsPayloadSchema rejects score above 10", () => {
    const result = NpsPayloadSchema.safeParse({ score: 11, category: "promoter" });
    expect(result.success).toBe(false);
  });

  it("NpsPayloadSchema rejects invalid category", () => {
    const result = NpsPayloadSchema.safeParse({ score: 5, category: "invalid" });
    expect(result.success).toBe(false);
  });

  it("FrictionPayloadSchema rejects description shorter than 10 chars", () => {
    const result = FrictionPayloadSchema.safeParse({ category: "bug", description: "short" });
    expect(result.success).toBe(false);
  });

  it("FrictionPayloadSchema rejects invalid category", () => {
    const result = FrictionPayloadSchema.safeParse({
      category: "invalid",
      description: "This is a valid description",
    });
    expect(result.success).toBe(false);
  });

  it("HelpfulnessPayloadSchema rejects missing sectionId", () => {
    const result = HelpfulnessPayloadSchema.safeParse({ helpful: true });
    expect(result.success).toBe(false);
  });

  it("FeedbackDocumentSchema rejects invalid type", () => {
    const doc = {
      id: "abc",
      userId: "user-1",
      type: "invalid",
      page: "/results",
      createdAt: "2026-03-20T10:00:00.000Z",
      payload: createNpsPayload(),
      metadata: createMetadata(),
    };
    const result = FeedbackDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("FeedbackPreferencesSchema rejects missing userId", () => {
    const prefs = {
      surveyDismissals: {},
      npsHistory: { count: 0, lastShownAt: "2026-03-20T10:00:00.000Z" },
    };
    const result = FeedbackPreferencesSchema.safeParse(prefs);
    expect(result.success).toBe(false);
  });

  it("FeedbackMetadataSchema rejects negative sessionDurationS", () => {
    const metadata = { ...createMetadata(), sessionDurationS: -5 };
    const result = FeedbackMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-001: createFeedback writes document with correct shape   */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-001: createFeedback", () => {
  it("writes a survey feedback document to Firestore", async () => {
    const result = await createFeedback(
      "user-123",
      "survey",
      "/results",
      createSurveyPayload(),
      createMetadata()
    );

    expect(mockFirestore.collection).toHaveBeenCalledWith("feedback");
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(result.userId).toBe("user-123");
    expect(result.type).toBe("survey");
    expect(result.page).toBe("/results");
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.payload).toEqual(createSurveyPayload());
    expect(result.metadata).toEqual(createMetadata());
  });

  it("writes an NPS feedback document to Firestore", async () => {
    const result = await createFeedback(
      "user-456",
      "nps",
      "/results",
      createNpsPayload(),
      createMetadata()
    );

    expect(result.userId).toBe("user-456");
    expect(result.type).toBe("nps");
    expect(result.payload).toEqual(createNpsPayload());
  });

  it("writes a friction feedback document to Firestore", async () => {
    const result = await createFeedback(
      "user-789",
      "friction",
      "/audit",
      createFrictionPayload(),
      createMetadata()
    );

    expect(result.userId).toBe("user-789");
    expect(result.type).toBe("friction");
    expect(result.payload).toEqual(createFrictionPayload());
  });

  it("writes a helpfulness feedback document to Firestore", async () => {
    const result = await createFeedback(
      "user-abc",
      "helpfulness",
      "/results",
      createHelpfulnessPayload(),
      createMetadata()
    );

    expect(result.userId).toBe("user-abc");
    expect(result.type).toBe("helpfulness");
    expect(result.payload).toEqual(createHelpfulnessPayload());
  });

  it("generates a UUID for the document ID", async () => {
    const result = await createFeedback(
      "user-123",
      "nps",
      "/results",
      createNpsPayload(),
      createMetadata()
    );

    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("sets createdAt as ISO 8601 timestamp", async () => {
    const before = new Date().toISOString();
    const result = await createFeedback(
      "user-123",
      "nps",
      "/results",
      createNpsPayload(),
      createMetadata()
    );
    const after = new Date().toISOString();

    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-002: getFeedbackPreferences returns validated prefs      */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-002: getFeedbackPreferences returns validated preferences", () => {
  it("returns preferences when document exists and is valid", async () => {
    const prefs = createPreferences();
    mockGet.mockResolvedValue({ exists: true, data: () => prefs });

    const result = await getFeedbackPreferences("user-123");

    expect(mockFirestore.collection).toHaveBeenCalledWith("feedback_preferences");
    expect(result).toEqual(prefs);
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-003: getFeedbackPreferences returns null for missing doc */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-003: getFeedbackPreferences returns null for missing document", () => {
  it("returns null when document does not exist", async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => undefined });

    const result = await getFeedbackPreferences("user-nonexistent");

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-004: getFeedbackPreferences returns null for invalid data */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-004: getFeedbackPreferences returns null for invalid data", () => {
  it("returns null when document data fails Zod validation", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ invalid: "data", missing: "required fields" }),
    });

    const result = await getFeedbackPreferences("user-corrupt");

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-005: updateFeedbackPreferences writes and returns prefs  */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-005: updateFeedbackPreferences", () => {
  it("writes preferences to Firestore and returns them", async () => {
    const prefs = createPreferences();

    const result = await updateFeedbackPreferences("user-123", prefs);

    expect(mockFirestore.collection).toHaveBeenCalledWith("feedback_preferences");
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(prefs);
    expect(result).toEqual(prefs);
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-141-008: Cloud Function routing logic                        */
/* ------------------------------------------------------------------ */

describe("T-PERF-141-008: Cloud Function email routing logic", () => {
  const baseFeedbackDoc = {
    id: "feedback-123",
    userId: "user-456",
    page: "/results",
    createdAt: "2026-03-20T10:00:00.000Z",
    metadata: createMetadata(),
  };

  it("routes NPS detractor (score <= 6) to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "nps" as const,
      payload: { score: 4, category: "detractor" as const, followUp: "Needs work" },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).not.toBeNull();
    expect(result?.to).toBe("team@lumosee.com");
    expect(result?.subject).toContain("NPS Detractor Alert");
    expect(result?.subject).toContain("Score 4");
  });

  it("routes NPS score 6 (boundary detractor) to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "nps" as const,
      payload: { score: 6, category: "detractor" as const },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).not.toBeNull();
    expect(result?.subject).toContain("Score 6");
  });

  it("does NOT route NPS passive (score 7) to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "nps" as const,
      payload: { score: 7, category: "passive" as const },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).toBeNull();
  });

  it("does NOT route NPS promoter (score 9) to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "nps" as const,
      payload: { score: 9, category: "promoter" as const },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).toBeNull();
  });

  it("routes friction report with category 'bug' to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "friction" as const,
      payload: {
        category: "bug" as const,
        description: "Export button broken on mobile viewport",
      },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).not.toBeNull();
    expect(result?.to).toBe("team@lumosee.com");
    expect(result?.subject).toContain("Bug Report");
  });

  it("does NOT route friction report with category 'ux_confusion' to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "friction" as const,
      payload: {
        category: "ux_confusion" as const,
        description: "Navigation menu is confusing on mobile",
      },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).toBeNull();
  });

  it("does NOT route friction report with category 'missing_feature' to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "friction" as const,
      payload: {
        category: "missing_feature" as const,
        description: "Would like PDF export support for reports",
      },
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).toBeNull();
  });

  it("does NOT route survey feedback to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "survey" as const,
      payload: createSurveyPayload(),
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).toBeNull();
  });

  it("does NOT route helpfulness feedback to email", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "helpfulness" as const,
      payload: createHelpfulnessPayload(),
    };

    const result = routeFeedbackToEmail(doc);

    expect(result).toBeNull();
  });

  it("buildNpsDetractorEmail includes all required fields", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "nps" as const,
      payload: { score: 3, category: "detractor" as const, followUp: "Too slow" },
    };

    const email = buildNpsDetractorEmail(doc, doc.payload);

    expect(email.subject).toBe("[NimbleVitals] NPS Detractor Alert — Score 3");
    expect(email.body).toContain("User ID: user-456");
    expect(email.body).toContain("Score: 3 / 10");
    expect(email.body).toContain("Category: detractor");
    expect(email.body).toContain("Follow-up: Too slow");
    expect(email.body).toContain("Page: /results");
    expect(email.body).toContain("Timestamp: 2026-03-20T10:00:00.000Z");
  });

  it("buildNpsDetractorEmail handles missing followUp", () => {
    const doc = {
      ...baseFeedbackDoc,
      type: "nps" as const,
      payload: { score: 2, category: "detractor" as const },
    };

    const email = buildNpsDetractorEmail(doc, doc.payload);

    expect(email.body).toContain("Follow-up: (none)");
  });

  it("buildBugReportEmail includes all required fields", () => {
    const payload = createFrictionPayload();
    const doc = {
      ...baseFeedbackDoc,
      type: "friction" as const,
      payload,
    };

    const email = buildBugReportEmail(doc, payload);

    expect(email.subject).toBe("[NimbleVitals] Bug Report from Pilot User");
    expect(email.body).toContain("User ID: user-456");
    expect(email.body).toContain("Category: bug");
    expect(email.body).toContain("Description: The export button does not respond");
    expect(email.body).toContain("User Action: Trying to export report");
    expect(email.body).toContain("Screenshot: feedback-screenshots/user-123/abc.png");
  });

  it("buildBugReportEmail handles missing optional fields", () => {
    const payload = {
      category: "bug" as const,
      description: "Something is broken in the audit flow",
    };
    const doc = {
      ...baseFeedbackDoc,
      type: "friction" as const,
      payload,
    };

    const email = buildBugReportEmail(doc, payload);

    expect(email.body).toContain("User Action: (not provided)");
    expect(email.body).toContain("Screenshot: (none)");
  });
});
