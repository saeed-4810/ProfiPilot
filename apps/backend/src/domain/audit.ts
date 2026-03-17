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

/** Zod schema for POST /audits request body (CTR-005). */
export const CreateAuditSchema = z.object({
  url: z.url("A valid URL is required.").refine((val) => val.startsWith("https://"), {
    message: "Only HTTPS URLs are allowed.",
  }),
});

export type CreateAuditRequest = z.infer<typeof CreateAuditSchema>;

/** Firestore document shape for the `audits` collection per ADR-006. */
export interface AuditJob {
  jobId: string;
  uid: string;
  url: string;
  status: AuditStatus;
  retryCount: number;
  lastError?: string | undefined;
  nextRetryAt?: string | undefined;
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
  retryCount: z.number(),
  lastError: z.string().optional(),
  nextRetryAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});
