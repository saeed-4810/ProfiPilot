/* v8 ignore start -- dashboard-service: aggregate logic tested via route-level tests with mocked service; adapter functions are Firestore queries */
import {
  countInProgressAuditsByUser,
  getLastCompletedAuditByUrl,
  getLatestAuditByUrl,
} from "../adapters/firestore-audit.js";
import { getAllProjectsByOwner, getProjectUrls } from "../adapters/firestore-project.js";

export interface DashboardStatsResult {
  activeProjects: number;
  inProgressAudits: number;
  avgPerformanceScore: number | null;
  attentionCount: number;
}

/** Build aggregate dashboard stats for the authenticated user. */
export async function getDashboardStats(uid: string): Promise<DashboardStatsResult> {
  const projects = await getAllProjectsByOwner(uid);
  const inProgressAudits = await countInProgressAuditsByUser(uid);

  if (projects.length === 0) {
    return {
      activeProjects: 0,
      inProgressAudits,
      avgPerformanceScore: null,
      attentionCount: 0,
    };
  }

  const latestCompletedScores: number[] = [];
  let attentionCount = 0;

  for (const project of projects) {
    const urls = await getProjectUrls(project.projectId);
    let projectNeedsAttention = false;

    for (const projectUrl of urls) {
      const latestAudit = await getLatestAuditByUrl(uid, projectUrl.url);
      if (latestAudit?.status === "failed") {
        projectNeedsAttention = true;
      }

      const latestCompleted = await getLastCompletedAuditByUrl(uid, projectUrl.url);
      const score = latestCompleted?.metrics?.performanceScore;

      if (score !== undefined && score !== null) {
        const displayScore = score * 100;
        latestCompletedScores.push(displayScore);
        if (displayScore < 50) {
          projectNeedsAttention = true;
        }
      }
    }

    if (projectNeedsAttention) {
      attentionCount += 1;
    }
  }

  const avgPerformanceScore =
    latestCompletedScores.length > 0
      ? Number(
          (
            latestCompletedScores.reduce((sum, score) => sum + score, 0) /
            latestCompletedScores.length
          ).toFixed(1)
        )
      : null;

  return {
    activeProjects: projects.length,
    inProgressAudits,
    avgPerformanceScore,
    attentionCount,
  };
}
/* v8 ignore stop */
