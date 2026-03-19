import { getFirebaseApp } from "../lib/firebase.js";
import {
  SummaryDocumentSchema,
  type AISummaryResult,
  type AISummaryOutput,
  type SummaryDocument,
} from "../domain/recommendation.js";

const COLLECTION = "summaries";

/**
 * Save an AI summary result to Firestore per database-schema.md.
 * Only saves when AI was available, metadata exists, and executiveSummary is non-null.
 * Stores the full AI output + 10 metadata fields per ADR-013 versioning strategy.
 *
 * Skips save when:
 * - aiAvailable is false (fallback mode — no AI output to persist)
 * - metadata is missing (incomplete generation)
 * - executiveSummary is null (defensive guard — should not happen when aiAvailable is true,
 *   but prevents persisting a document that would fail Zod validation on read)
 */
export async function saveSummary(auditId: string, summary: AISummaryResult): Promise<void> {
  if (!summary.aiAvailable || !summary.metadata || summary.executiveSummary === null) return;

  const firestore = getFirebaseApp().firestore();

  const doc: SummaryDocument = {
    auditId,
    modelVersion: summary.metadata.modelVersion,
    promptHash: summary.metadata.promptHash,
    promptVersion: summary.metadata.promptVersion,
    temperature: summary.metadata.temperature,
    inputHash: summary.metadata.inputHash,
    content: {
      executiveSummary: summary.executiveSummary,
      tickets: summary.tickets as AISummaryOutput["tickets"],
    },
    generatedAt: summary.metadata.generatedAt,
    latencyMs: summary.metadata.latencyMs,
    inputTokens: summary.metadata.inputTokens,
    outputTokens: summary.metadata.outputTokens,
    costUsd: summary.metadata.costUsd,
  };

  await firestore.collection(COLLECTION).doc().set(doc);
}

/**
 * Get the most recent AI summary for an audit from Firestore.
 * Returns null if no summary exists or if the document is corrupted.
 * Uses Zod safeParse to silently filter corrupted documents (per ADR-017).
 */
export async function getSummary(auditId: string): Promise<AISummaryResult | null> {
  const firestore = getFirebaseApp().firestore();
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("auditId", "==", auditId)
    .orderBy("generatedAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const parsed = SummaryDocumentSchema.safeParse(snapshot.docs[0]!.data());
  if (!parsed.success) return null;

  const doc = parsed.data;

  return {
    auditId: doc.auditId,
    executiveSummary: doc.content.executiveSummary,
    tickets: doc.content.tickets,
    aiAvailable: true,
    metadata: {
      modelVersion: doc.modelVersion,
      promptHash: doc.promptHash,
      promptVersion: doc.promptVersion,
      temperature: doc.temperature,
      inputHash: doc.inputHash,
      generatedAt: doc.generatedAt,
      latencyMs: doc.latencyMs,
      inputTokens: doc.inputTokens,
      outputTokens: doc.outputTokens,
      costUsd: doc.costUsd,
    },
  };
}
