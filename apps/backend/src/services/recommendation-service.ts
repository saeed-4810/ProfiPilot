import { randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import type { AuditJob } from "../domain/audit.js";
import type {
  RuleEngineOutput,
  RecommendationDocument,
  AISummaryResult,
  AITicket,
  FallbackReason,
  Severity,
  IssueCategory,
  RuleEngineEvidence,
} from "../domain/recommendation.js";
import { getAuditJob } from "../adapters/firestore-audit.js";
import { saveRecommendations, getRecommendations } from "../adapters/firestore-recommendation.js";
import { saveSummary, getSummary } from "../adapters/firestore-summary.js";
import { generateRecommendations } from "./rule-engine.js";
import { generateAISummary } from "./ai-narrative.js";

/**
 * CTR-007 response shape: recommendation without Firestore-internal fields.
 * Strips `auditId` and `createdAt` from RecommendationDocument.
 */
export interface CTR007Recommendation {
  ruleId: string;
  metric: string;
  severity: Severity;
  category: IssueCategory;
  currentValue: string;
  targetValue: string;
  suggestedFix: string;
  evidence: RuleEngineEvidence;
}

/** CTR-007 GET /audits/:id/recommendations response. */
export interface CTR007Response {
  auditId: string;
  recommendations: CTR007Recommendation[];
}

/**
 * CTR-008 response shape when AI is available.
 * Metadata fields are flattened to top level per API spec.
 */
export interface CTR008ResponseAI {
  auditId: string;
  executiveSummary: string;
  tickets: AITicket[];
  modelVersion: string;
  promptHash: string;
  generatedAt: string;
  aiAvailable: true;
}

/**
 * CTR-008 response shape when AI is unavailable (graceful degradation).
 * Returns rule engine output as tickets with fallback reason.
 */
export interface CTR008ResponseFallback {
  auditId: string;
  executiveSummary: null;
  tickets: RuleEngineOutput[];
  aiAvailable: false;
  fallbackReason: FallbackReason;
}

/** CTR-008 GET /audits/:id/summary response (discriminated union). */
export type CTR008Response = CTR008ResponseAI | CTR008ResponseFallback;

/** POST /audits/:id/recommendations/regenerate response. */
export interface RegenerateResponse {
  generationId: string;
  status: "queued";
}

/**
 * In-memory set tracking active regeneration jobs per audit.
 * MVP limitation: lost on process restart. No stale locks — if process crashes
 * during regeneration, the lock auto-clears.
 * Post-MVP: replace with Firestore-based lock with TTL.
 */
const activeRegenerations = new Set<string>();

/** Exported for testing — allows tests to inspect/clear the active set. */
export function _getActiveRegenerations(): Set<string> {
  return activeRegenerations;
}

/**
 * Validate audit access: not-found (404) → owner (403) → status (400) → metrics (500).
 * Shared by all three service functions per ADR-003 owner-check pattern.
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
 * Map RecommendationDocument[] to CTR007Recommendation[] by stripping
 * Firestore-internal fields (auditId, createdAt).
 */
function mapToCtR007(docs: RecommendationDocument[]): CTR007Recommendation[] {
  return docs.map(
    ({
      ruleId,
      metric,
      severity,
      category,
      currentValue,
      targetValue,
      suggestedFix,
      evidence,
    }) => ({
      ruleId,
      metric,
      severity,
      category,
      currentValue,
      targetValue,
      suggestedFix,
      evidence,
    })
  );
}

/**
 * Map AISummaryResult to CTR008Response.
 * When AI is available: flattens metadata to top level per CTR-008 spec.
 * When AI is unavailable: returns fallback with reason.
 */
function mapToCtR008(auditId: string, summary: AISummaryResult): CTR008Response {
  if (summary.aiAvailable && summary.metadata) {
    return {
      auditId,
      executiveSummary: summary.executiveSummary as string,
      tickets: summary.tickets as AITicket[],
      modelVersion: summary.metadata.modelVersion,
      promptHash: summary.metadata.promptHash,
      generatedAt: summary.metadata.generatedAt,
      aiAvailable: true,
    };
  }

  return {
    auditId,
    executiveSummary: null,
    tickets: summary.tickets as RuleEngineOutput[],
    aiAvailable: false,
    fallbackReason: summary.fallbackReason as FallbackReason,
  };
}

/**
 * GET /audits/:id/recommendations — CTR-007.
 * Returns deterministic rule engine recommendations for a completed audit.
 * Generates and persists recommendations on first access (lazy generation).
 */
export async function getAuditRecommendations(
  uid: string,
  auditId: string
): Promise<CTR007Response> {
  const job = await getAuditJob(auditId);
  const validatedJob = validateAuditAccess(uid, job);

  let docs = await getRecommendations(auditId);

  if (docs.length === 0) {
    const ruleEngineOutput = generateRecommendations(validatedJob.metrics!);
    await saveRecommendations(auditId, ruleEngineOutput);
    docs = await getRecommendations(auditId);
  }

  return {
    auditId,
    recommendations: mapToCtR007(docs),
  };
}

/**
 * GET /audits/:id/summary — CTR-008.
 * Returns AI-enhanced summary with executive narrative and developer tickets.
 * Falls back to rule engine output when AI is unavailable (graceful degradation).
 * Generates and persists summary on first access (lazy generation).
 */
export async function getAuditSummary(uid: string, auditId: string): Promise<CTR008Response> {
  const job = await getAuditJob(auditId);
  const validatedJob = validateAuditAccess(uid, job);

  const existingSummary = await getSummary(auditId);

  if (existingSummary) {
    return mapToCtR008(auditId, existingSummary);
  }

  // Generate new summary: rule engine first, then AI narrative
  const ruleEngineOutput = generateRecommendations(validatedJob.metrics!);
  const result = await generateAISummary(
    auditId,
    validatedJob.url,
    validatedJob.strategy,
    validatedJob.metrics!,
    ruleEngineOutput
  );

  // Persist summary (adapter skips save when aiAvailable === false)
  await saveSummary(auditId, result);

  // Persist recommendations if not already saved
  const existingRecs = await getRecommendations(auditId);
  if (existingRecs.length === 0) {
    await saveRecommendations(auditId, ruleEngineOutput);
  }

  return mapToCtR008(auditId, result);
}

/**
 * POST /audits/:id/recommendations/regenerate.
 * Queues a background regeneration of AI summary for a completed audit.
 * Uses in-memory lock to prevent concurrent regenerations per audit.
 * Returns 202 with generationId immediately (fire-and-forget).
 */
export async function regenerateRecommendations(
  uid: string,
  auditId: string
): Promise<RegenerateResponse> {
  const job = await getAuditJob(auditId);
  const validatedJob = validateAuditAccess(uid, job);

  if (activeRegenerations.has(auditId)) {
    throw new AppError(
      409,
      "AUDIT_CONFLICT",
      "A regeneration is already in progress for this audit."
    );
  }

  activeRegenerations.add(auditId);

  // Fire-and-forget background regeneration
  void (async () => {
    try {
      const ruleEngineOutput = generateRecommendations(validatedJob.metrics!);
      const result = await generateAISummary(
        auditId,
        validatedJob.url,
        validatedJob.strategy,
        validatedJob.metrics!,
        ruleEngineOutput
      );
      await saveSummary(auditId, result);
    } catch {
      // Swallow errors — fire-and-forget background task.
      // AI failures are non-critical; the user can retry via regenerate endpoint.
    } finally {
      activeRegenerations.delete(auditId);
    }
  })();

  return {
    generationId: randomUUID(),
    status: "queued",
  };
}
