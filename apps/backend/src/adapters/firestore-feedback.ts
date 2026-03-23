import { randomUUID } from "node:crypto";
import { getFirebaseApp } from "../lib/firebase.js";
import {
  FeedbackPreferencesSchema,
  type FeedbackDocument,
  type FeedbackMetadata,
  type FeedbackPreferences,
  type FeedbackType,
  type SurveyPayload,
  type NpsPayload,
  type FrictionPayload,
  type HelpfulnessPayload,
} from "../domain/feedback.js";

/**
 * Firestore adapter for `feedback` and `feedback_preferences` collections.
 *
 * ADR-021 compliance:
 * - Convention 1: One adapter file per collection group (feedback + feedback_preferences)
 * - Convention 2: randomUUID() for document IDs
 * - Convention 3: ISO 8601 strings for timestamps
 * - Convention 4: safeParse for read validation
 * - Convention 5: Collection name as module constant
 * - Convention 6: Direct import (no DI) for MVP
 *
 * PERF-141: Pilot feedback collection mechanism.
 */

const FEEDBACK_COLLECTION = "feedback" as const;
const FEEDBACK_PREFERENCES_COLLECTION = "feedback_preferences" as const;

/* ------------------------------------------------------------------ */
/* Feedback CRUD                                                       */
/* ------------------------------------------------------------------ */

/** Create a new feedback document in Firestore. Returns the created FeedbackDocument. */
export async function createFeedback(
  userId: string,
  type: FeedbackType,
  page: string,
  payload: SurveyPayload | NpsPayload | FrictionPayload | HelpfulnessPayload,
  metadata: FeedbackMetadata
): Promise<FeedbackDocument> {
  const firestore = getFirebaseApp().firestore();
  const id = randomUUID();
  const now = new Date().toISOString();

  const doc: FeedbackDocument = {
    id,
    userId,
    type,
    page,
    createdAt: now,
    payload,
    metadata,
  };

  await firestore.collection(FEEDBACK_COLLECTION).doc(id).set(doc);
  return doc;
}

/* ------------------------------------------------------------------ */
/* Feedback Preferences CRUD                                           */
/* ------------------------------------------------------------------ */

/** Read feedback preferences for a user. Returns null if not found or invalid. */
export async function getFeedbackPreferences(userId: string): Promise<FeedbackPreferences | null> {
  const firestore = getFirebaseApp().firestore();
  const doc = await firestore.collection(FEEDBACK_PREFERENCES_COLLECTION).doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  // Runtime validation guards against corrupt Firestore data (ADR-017, ADR-021 Convention 4)
  const parsed = FeedbackPreferencesSchema.safeParse(doc.data());
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

/** Create or update feedback preferences for a user. Returns the saved preferences. */
export async function updateFeedbackPreferences(
  userId: string,
  preferences: FeedbackPreferences
): Promise<FeedbackPreferences> {
  const firestore = getFirebaseApp().firestore();

  await firestore.collection(FEEDBACK_PREFERENCES_COLLECTION).doc(userId).set(preferences);

  return preferences;
}
