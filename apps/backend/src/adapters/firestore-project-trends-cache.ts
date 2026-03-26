/* v8 ignore start -- Firestore cache adapter: thin persistence wrapper, verified via service-level tests and docs */
import { z } from "zod";
import { getFirebaseApp } from "../lib/firebase.js";

const COLLECTION = "project_trends_cache";

const CruxPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  lcpP75: z.number().nullable(),
  clsP75: z.number().nullable(),
  inpP75: z.number().nullable(),
  fcpP75: z.number().nullable(),
  ttfbP75: z.number().nullable(),
});

const LabDataPointSchema = z.object({
  date: z.string(),
  lcp: z.number().nullable(),
  cls: z.number().nullable(),
  tbt: z.number().nullable(),
  performanceScore: z.number().nullable(),
});

export const ProjectTrendsCacheSchema = z.object({
  projectId: z.string(),
  cruxAvailable: z.boolean(),
  cruxPeriods: z.array(CruxPeriodSchema),
  labDataPoints: z.array(LabDataPointSchema),
  computedAt: z.string(),
  expiresAt: z.string(),
});

export type ProjectTrendsCache = z.infer<typeof ProjectTrendsCacheSchema>;

export async function getProjectTrendsCache(projectId: string): Promise<ProjectTrendsCache | null> {
  const snapshot = await getFirebaseApp().firestore().collection(COLLECTION).doc(projectId).get();
  if (!snapshot.exists) return null;
  const parsed = ProjectTrendsCacheSchema.safeParse(snapshot.data());
  return parsed.success ? parsed.data : null;
}

export async function setProjectTrendsCache(data: ProjectTrendsCache): Promise<void> {
  await getFirebaseApp().firestore().collection(COLLECTION).doc(data.projectId).set(data);
}

export async function deleteProjectTrendsCache(projectId: string): Promise<void> {
  await getFirebaseApp().firestore().collection(COLLECTION).doc(projectId).delete();
}
/* v8 ignore stop */
