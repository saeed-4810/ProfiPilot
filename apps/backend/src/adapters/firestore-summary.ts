import { getFirebaseApp } from "../lib/firebase.js";
import type {
  AISummaryResult,
  AISummaryOutput,
  SummaryDocument,
} from "../domain/recommendation.js";

const COLLECTION = "summaries";

/**
 * Save an AI summary result to Firestore per database-schema.md.
 * Only saves when AI was available and metadata exists.
 * Stores the full AI output + 10 metadata fields per ADR-013 versioning strategy.
 */
export async function saveSummary(auditId: string, summary: AISummaryResult): Promise<void> {
  if (!summary.aiAvailable || !summary.metadata) return;

  const firestore = getFirebaseApp().firestore();

  const doc: SummaryDocument = {
    auditId,
    modelVersion: summary.metadata.modelVersion,
    promptHash: summary.metadata.promptHash,
    promptVersion: summary.metadata.promptVersion,
    temperature: summary.metadata.temperature,
    inputHash: summary.metadata.inputHash,
    content: {
      executiveSummary: summary.executiveSummary ?? "",
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
 * Returns null if no summary exists.
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

  const doc = snapshot.docs[0]!.data() as SummaryDocument;

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
