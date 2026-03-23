import { z } from "zod";

/**
 * Feedback domain types and Zod schemas per PERF-141.
 *
 * Covers four feedback types collected from pilot users:
 * - Survey: 8-question in-app survey (first audit, 3rd session, first export)
 * - NPS: Post-audit Net Promoter Score (0-10)
 * - Friction: Bug/UX/feature/performance reports via persistent button
 * - Helpfulness: Binary "Was this helpful?" on results page
 *
 * ADR-021 compliance: Zod schemas for safeParse read validation.
 * ADR-016 compliance: No PII in error messages.
 */

/* ------------------------------------------------------------------ */
/* Feedback type discriminator                                         */
/* ------------------------------------------------------------------ */

export const FeedbackType = {
  SURVEY: "survey",
  NPS: "nps",
  FRICTION: "friction",
  HELPFULNESS: "helpfulness",
} as const;

export type FeedbackType = (typeof FeedbackType)[keyof typeof FeedbackType];

/* ------------------------------------------------------------------ */
/* Survey payload                                                      */
/* ------------------------------------------------------------------ */

export const SurveyTrigger = {
  FIRST_AUDIT: "first_audit",
  THIRD_SESSION: "third_session",
  FIRST_EXPORT: "first_export",
} as const;

export type SurveyTrigger = (typeof SurveyTrigger)[keyof typeof SurveyTrigger];

export const SurveyPayloadSchema = z.object({
  trigger: z.enum(["first_audit", "third_session", "first_export"]),
  responses: z.object({
    q1_value_rating: z.number().int().min(1).max(5),
    q2_ease_rating: z.number().int().min(1).max(5),
    q3_missing_feature: z.string().max(500).optional(),
    q4_friction: z.string().max(500).optional(),
    q5_nps_score: z.number().int().min(0).max(10),
    q6_competitive_comparison: z.string().max(500).optional(),
    q7_wtp: z.string(),
    q8_pmf: z.enum(["very_disappointed", "somewhat_disappointed", "not_disappointed"]),
  }),
  completionTimeMs: z.number().nonnegative(),
});

export type SurveyPayload = z.infer<typeof SurveyPayloadSchema>;

/* ------------------------------------------------------------------ */
/* NPS payload                                                         */
/* ------------------------------------------------------------------ */

export const NpsCategory = {
  DETRACTOR: "detractor",
  PASSIVE: "passive",
  PROMOTER: "promoter",
} as const;

export type NpsCategory = (typeof NpsCategory)[keyof typeof NpsCategory];

export const NpsPayloadSchema = z.object({
  score: z.number().int().min(0).max(10),
  category: z.enum(["detractor", "passive", "promoter"]),
  followUp: z.string().max(300).optional(),
});

export type NpsPayload = z.infer<typeof NpsPayloadSchema>;

/* ------------------------------------------------------------------ */
/* Friction payload                                                    */
/* ------------------------------------------------------------------ */

export const FrictionCategory = {
  BUG: "bug",
  UX_CONFUSION: "ux_confusion",
  MISSING_FEATURE: "missing_feature",
  PERFORMANCE: "performance",
  OTHER: "other",
} as const;

export type FrictionCategory = (typeof FrictionCategory)[keyof typeof FrictionCategory];

export const FrictionPayloadSchema = z.object({
  category: z.enum(["bug", "ux_confusion", "missing_feature", "performance", "other"]),
  description: z.string().min(10).max(1000),
  userAction: z.string().max(200).optional(),
  screenshotUrl: z.string().optional(),
});

export type FrictionPayload = z.infer<typeof FrictionPayloadSchema>;

/* ------------------------------------------------------------------ */
/* Helpfulness payload                                                 */
/* ------------------------------------------------------------------ */

export const HelpfulnessPayloadSchema = z.object({
  helpful: z.boolean(),
  comment: z.string().max(300).optional(),
  sectionId: z.string(),
});

export type HelpfulnessPayload = z.infer<typeof HelpfulnessPayloadSchema>;

/* ------------------------------------------------------------------ */
/* Feedback document (Firestore shape)                                 */
/* ------------------------------------------------------------------ */

export const FeedbackMetadataSchema = z.object({
  browser: z.string(),
  viewport: z.string(),
  sessionDurationS: z.number().nonnegative(),
  appVersion: z.string(),
});

export type FeedbackMetadata = z.infer<typeof FeedbackMetadataSchema>;

export const FeedbackDocumentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["survey", "nps", "friction", "helpfulness"]),
  page: z.string(),
  createdAt: z.string(),
  payload: z.union([
    SurveyPayloadSchema,
    NpsPayloadSchema,
    FrictionPayloadSchema,
    HelpfulnessPayloadSchema,
  ]),
  metadata: FeedbackMetadataSchema,
});

export type FeedbackDocument = z.infer<typeof FeedbackDocumentSchema>;

/* ------------------------------------------------------------------ */
/* Feedback preferences (per-user dismissal/cap state)                 */
/* ------------------------------------------------------------------ */

const SurveyDismissalSchema = z.object({
  count: z.number().int().nonnegative(),
  permanent: z.boolean(),
  lastDismissedAt: z.string(),
});

const NpsHistorySchema = z.object({
  count: z.number().int().nonnegative(),
  lastShownAt: z.string(),
});

export const FeedbackPreferencesSchema = z.object({
  userId: z.string(),
  surveyDismissals: z.record(z.string(), SurveyDismissalSchema),
  npsHistory: NpsHistorySchema,
  lastPromptSessionId: z.string().optional(),
});

export type FeedbackPreferences = z.infer<typeof FeedbackPreferencesSchema>;
