import { getFirebaseApp } from "../lib/firebase.js";
import type { RuleEngineOutput, RecommendationDocument } from "../domain/recommendation.js";
import { formatMetricValue, getTargetValue } from "../services/rule-engine.js";

const COLLECTION = "recommendations";

/**
 * Save rule engine recommendations to Firestore per database-schema.md.
 * Creates one document per recommendation, all linked to the parent audit.
 *
 * Uses a batch write for atomicity — all recommendations for an audit
 * are written together or not at all.
 */
export async function saveRecommendations(
  auditId: string,
  recommendations: RuleEngineOutput[]
): Promise<void> {
  if (recommendations.length === 0) return;

  const firestore = getFirebaseApp().firestore();
  const batch = firestore.batch();
  const now = new Date().toISOString();

  for (const rec of recommendations) {
    const doc: RecommendationDocument = {
      auditId,
      ruleId: rec.ruleId,
      metric: rec.metric,
      currentValue: formatMetricValue(rec.value, rec.unit),
      targetValue: getTargetValue(rec.metric),
      severity: rec.severity,
      category: rec.category,
      suggestedFix: rec.suggestedFix,
      evidence: rec.evidence,
      createdAt: now,
    };

    const docRef = firestore.collection(COLLECTION).doc();
    batch.set(docRef, doc);
  }

  await batch.commit();
}

/**
 * Get all recommendations for an audit from Firestore.
 * Returns an empty array if no recommendations exist.
 */
export async function getRecommendations(auditId: string): Promise<RecommendationDocument[]> {
  const firestore = getFirebaseApp().firestore();
  const snapshot = await firestore.collection(COLLECTION).where("auditId", "==", auditId).get();

  return snapshot.docs.map((doc) => doc.data() as RecommendationDocument);
}
