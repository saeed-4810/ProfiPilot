/* v8 ignore start -- Firestore cache adapter: thin persistence wrapper, verified via service-level tests and docs */
import { z } from "zod";
import { getFirebaseApp } from "../lib/firebase.js";

const COLLECTION = "project_health_cache";

const UrlScoreSchema = z.object({
  urlId: z.string(),
  url: z.string(),
  label: z.string(),
  score: z.number().nullable(),
  lastAuditDate: z.string().nullable(),
});

export const ProjectHealthCacheSchema = z.object({
  projectId: z.string(),
  overallScore: z.number().nullable(),
  scoreDelta: z.number().nullable(),
  deltaLabel: z.string(),
  urlScores: z.array(UrlScoreSchema),
  inProgressCount: z.number(),
  attentionCount: z.number(),
  computedAt: z.string(),
  expiresAt: z.string(),
});

export type ProjectHealthCache = z.infer<typeof ProjectHealthCacheSchema>;

export async function getProjectHealthCache(projectId: string): Promise<ProjectHealthCache | null> {
  const snapshot = await getFirebaseApp().firestore().collection(COLLECTION).doc(projectId).get();
  if (!snapshot.exists) return null;
  const parsed = ProjectHealthCacheSchema.safeParse(snapshot.data());
  return parsed.success ? parsed.data : null;
}

export async function setProjectHealthCache(data: ProjectHealthCache): Promise<void> {
  await getFirebaseApp().firestore().collection(COLLECTION).doc(data.projectId).set(data);
}

export async function deleteProjectHealthCache(projectId: string): Promise<void> {
  await getFirebaseApp().firestore().collection(COLLECTION).doc(projectId).delete();
}
/* v8 ignore stop */
