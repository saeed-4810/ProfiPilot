import { AppError } from "../domain/errors.js";
import type { AuditJob, AuditMetrics } from "../domain/audit.js";
import type { AISummaryResult, RuleEngineOutput } from "../domain/recommendation.js";
import { getAuditJob } from "../adapters/firestore-audit.js";
import { getSummary } from "../adapters/firestore-summary.js";
import { generateRecommendations } from "./rule-engine.js";
import { renderExportMarkdown, type ExportInput } from "./export-renderer.js";

/**
 * Supported export formats per ADR-009 / ADR-015.
 * MVP: markdown only. PDF deferred per ADR-015 §5.
 */
const SUPPORTED_FORMATS = new Set(["md"]);

/**
 * Validate audit access: not-found (404) -> owner (403) -> status (400) -> metrics (500).
 * Reuses Pattern B from ADR-014 (same order as recommendation-service.ts).
 */
function validateAuditAccess(uid: string, job: AuditJob | null): AuditJob {
  if (!job) {
    throw new AppError(404, "AUDIT_NOT_FOUND", "Audit job not found.");
  }

  if (job.uid !== uid) {
    throw new AppError(403, "AUDIT_FORBIDDEN", "You do not have access to this audit job.");
  }

  if (job.status !== "completed") {
    throw new AppError(
      400,
      "AUDIT_NOT_COMPLETED",
      "Audit is still processing, results not yet available."
    );
  }

  if (!job.metrics) {
    throw new AppError(500, "INTERNAL_ERROR", "Audit completed but metrics are missing.");
  }

  return job;
}

/**
 * Validate the requested export format.
 * Returns the validated format string.
 * Throws 422 EXPORT_FORMAT_INVALID for unsupported formats (including pdf per ADR-015 §5).
 */
export function validateExportFormat(format: string | undefined): string {
  const normalizedFormat = (format ?? "md").toLowerCase();

  if (!SUPPORTED_FORMATS.has(normalizedFormat)) {
    throw new AppError(
      422,
      "EXPORT_FORMAT_INVALID",
      `Export format "${normalizedFormat}" is not supported. Supported formats: md.`
    );
  }

  return normalizedFormat;
}

/**
 * Build a fallback AISummaryResult when no AI summary exists in Firestore.
 * Uses rule engine to regenerate recommendations from metrics (deterministic).
 * Produces "AI summary not available" placeholder per ADR-015 §2.
 */
function buildFallbackSummary(auditId: string, metrics: AuditMetrics): AISummaryResult {
  const ruleEngineOutput: RuleEngineOutput[] = generateRecommendations(metrics);

  return {
    auditId,
    executiveSummary: null,
    tickets: ruleEngineOutput,
    aiAvailable: false,
    fallbackReason: "openai_unavailable",
  };
}

/**
 * Generate a markdown export for a completed audit (CTR-009).
 *
 * Orchestration flow per ADR-015 §6:
 * 1. Validate export format
 * 2. Validate audit access (Pattern B from ADR-014)
 * 3. Fetch AI summary from Firestore (or build fallback from rule engine)
 * 4. Render markdown via export-renderer (pure function)
 *
 * Returns the rendered markdown string.
 */
export async function generateExport(
  uid: string,
  auditId: string,
  format: string
): Promise<string> {
  validateExportFormat(format);

  const job = await getAuditJob(auditId);
  const validatedJob = validateAuditAccess(uid, job);

  const summary = await getSummary(auditId);
  const effectiveSummary: AISummaryResult =
    summary ?? buildFallbackSummary(auditId, validatedJob.metrics!);

  const input: ExportInput = {
    job: {
      url: validatedJob.url,
      strategy: validatedJob.strategy,
      completedAt: validatedJob.completedAt,
      updatedAt: validatedJob.updatedAt,
    },
    metrics: validatedJob.metrics!,
    summary: effectiveSummary,
  };

  return renderExportMarkdown(input);
}
