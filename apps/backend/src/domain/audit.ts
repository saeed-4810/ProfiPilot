import { z } from "zod";

/**
 * Audit job lifecycle states per ADR-006.
 * State machine: queued -> running -> completed | failed | cancelled
 *                running -> retrying (max 3) -> running | failed
 */
export const AuditStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  RETRYING: "retrying",
} as const;

export type AuditStatus = (typeof AuditStatus)[keyof typeof AuditStatus];

/**
 * Audit strategy per ADR-012.
 * - "mobile": PSI mobile emulation (Moto G Power + slow 4G)
 * - "desktop": PSI desktop (no throttling)
 * - "both": runs two PSI calls (mobile + desktop), stores combined metrics
 */
export type AuditStrategy = "mobile" | "desktop" | "both";

/** The PSI API only accepts "mobile" or "desktop" — "both" is resolved at the service layer. */
export type PSIStrategy = "mobile" | "desktop";

/** Zod schema for POST /audits request body (CTR-005). */
export const CreateAuditSchema = z.object({
  url: z.url("A valid URL is required.").refine((val) => val.startsWith("https://"), {
    message: "Only HTTPS URLs are allowed.",
  }),
  strategy: z.enum(["mobile", "desktop", "both"]).optional().default("mobile"),
});

export type CreateAuditRequest = z.infer<typeof CreateAuditSchema>;

/**
 * Zod schema for CWV metrics extracted from PSI API response per ADR-012.
 * All numeric values are in milliseconds except CLS (unitless) and performanceScore (0-1).
 * fieldData is CrUX data — null when not available for the URL.
 */
export const AuditMetricsSchema = z.object({
  lcp: z.number().nullable(),
  cls: z.number().nullable(),
  tbt: z.number().nullable(),
  fcp: z.number().nullable(),
  ttfb: z.number().nullable(),
  si: z.number().nullable(),
  performanceScore: z.number().nullable(),
  lighthouseVersion: z.string().nullable(),
  fieldData: z.record(z.string(), z.unknown()).nullable(),
  fetchedAt: z.string(),
});

export type AuditMetrics = z.infer<typeof AuditMetricsSchema>;

/** Firestore document shape for the `audits` collection per ADR-006, ADR-012. */
export interface AuditJob {
  jobId: string;
  uid: string;
  url: string;
  status: AuditStatus;
  strategy: AuditStrategy;
  retryCount: number;
  lastError?: string | undefined;
  nextRetryAt?: string | undefined;
  /** Mobile metrics (or single-strategy metrics when strategy is "mobile" or "desktop"). */
  metrics?: AuditMetrics | undefined;
  /** Desktop metrics — only populated when strategy is "both". */
  desktopMetrics?: AuditMetrics | undefined;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
}

/**
 * Zod schema for runtime validation of Firestore audit documents (W5).
 * Guards against corrupt or unexpected data from the database.
 */
export const AuditJobSchema = z.object({
  jobId: z.string(),
  uid: z.string(),
  url: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled", "retrying"]),
  strategy: z.enum(["mobile", "desktop", "both"]).optional(),
  retryCount: z.number(),
  lastError: z.string().optional(),
  nextRetryAt: z.string().optional(),
  metrics: AuditMetricsSchema.optional(),
  desktopMetrics: AuditMetricsSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});
