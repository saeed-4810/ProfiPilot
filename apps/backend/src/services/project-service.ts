import { AppError } from "../domain/errors.js";
import { normalizeUrl, type Project, type ProjectUrl } from "../domain/project.js";
import {
  createProject as createProjectDoc,
  getProject as getProjectDoc,
  getProjectsByOwner,
  addUrlToProject as addUrlDoc,
  deleteUrl as deleteUrlDoc,
  getProjectUrls,
  updateProject as updateProjectDoc,
} from "../adapters/firestore-project.js";
import { getLatestAuditByUrl, getLastCompletedAuditByUrl } from "../adapters/firestore-audit.js";

/** Response shape for POST /api/v1/projects (CTR-003). */
export interface CreateProjectResult {
  projectId: string;
  name: string;
  description?: string | null;
  createdAt: string;
}

/** Per-project health status for dashboard cards. */
export type ProjectHealthStatus = "healthy" | "in_progress" | "attention" | "unknown";

export interface ProjectListItem extends Project {
  urlCount: number;
  healthStatus: ProjectHealthStatus;
}

/** Response shape for GET /api/v1/projects (CTR-003). */
export interface ListProjectsResult {
  page: number;
  size: number;
  total: number;
  items: ProjectListItem[];
}

/** Response shape for GET /api/v1/projects/:id (CTR-003). */
export interface GetProjectResult {
  project: Project;
  urls: ProjectUrl[];
}

/** Response shape for POST /api/v1/projects/:id/urls (CTR-004). */
export interface AddUrlResult {
  urlId: string;
  url: string;
  normalizedUrl: string;
  addedAt: string;
}

export interface UpdateProjectResult {
  projectId: string;
  name: string;
  description?: string | null;
  updatedAt: string;
}

/**
 * Create a new project for the authenticated user.
 * Delegates persistence to the Firestore adapter.
 */
export async function createProject(
  uid: string,
  name: string,
  description?: string | null
): Promise<CreateProjectResult> {
  const project = await createProjectDoc(uid, name, description);

  return {
    projectId: project.projectId,
    name: project.name,
    ...(project.description !== undefined ? { description: project.description } : {}),
    createdAt: project.createdAt,
  };
}

/**
 * List projects for the authenticated user with pagination.
 * Returns only projects where ownerId matches the authenticated user.
 */
export async function listProjects(
  uid: string,
  page: number,
  size: number
): Promise<ListProjectsResult> {
  const { projects, total } = await getProjectsByOwner(uid, page, size);
  const items = await Promise.all(
    projects.map(async (project) => {
      const urls = await getProjectUrls(project.projectId);
      const healthStatus = await computeProjectHealthStatus(uid, urls);
      return {
        ...project,
        urlCount: urls.length,
        healthStatus,
      };
    })
  );

  return {
    page,
    size,
    total,
    items,
  };
}

/* v8 ignore start -- computeProjectHealthStatus: aggregate logic using audit adapters, same pattern as dashboard-service (DEC-W17-012) */
/**
 * Compute per-project health status for dashboard card display.
 * - "healthy": all latest completed audits score >= 50
 * - "in_progress": at least one audit is queued or running
 * - "attention": at least one latest audit score < 50 or status is failed
 * - "unknown": no URLs or no audits
 */
async function computeProjectHealthStatus(
  uid: string,
  urls: ProjectUrl[]
): Promise<ProjectHealthStatus> {
  if (urls.length === 0) return "unknown";

  let hasInProgress = false;
  let hasAttention = false;
  let hasAnyScore = false;

  for (const url of urls) {
    const latest = await getLatestAuditByUrl(uid, url.url);
    if (latest === null) continue;

    if (latest.status === "queued" || latest.status === "running") {
      hasInProgress = true;
    }

    if (latest.status === "failed") {
      hasAttention = true;
    }

    const completed = await getLastCompletedAuditByUrl(uid, url.url);
    if (
      completed?.metrics?.performanceScore !== undefined &&
      completed.metrics.performanceScore !== null
    ) {
      hasAnyScore = true;
      if (completed.metrics.performanceScore * 100 < 50) {
        hasAttention = true;
      }
    }
  }

  if (hasAttention) return "attention";
  if (hasInProgress) return "in_progress";
  if (hasAnyScore) return "healthy";
  return "unknown";
}
/* v8 ignore stop */

/**
 * Get a single project with its URLs for the authenticated user.
 * Enforces owner-only access: throws 404 if not found, 403 if not owner.
 */
export async function getProject(uid: string, projectId: string): Promise<GetProjectResult> {
  const project = await getProjectDoc(projectId);

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }

  if (project.ownerId !== uid) {
    throw new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.");
  }

  const urls = await getProjectUrls(projectId);

  return { project, urls };
}

/**
 * Add a URL to a project. Validates ownership and normalizes the URL.
 * Throws 404 if project not found, 403 if not owner.
 */
export async function addUrl(uid: string, projectId: string, url: string): Promise<AddUrlResult> {
  const project = await getProjectDoc(projectId);

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }

  if (project.ownerId !== uid) {
    throw new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.");
  }

  const normalized = normalizeUrl(url);
  const projectUrl = await addUrlDoc(projectId, url, normalized);

  return {
    urlId: projectUrl.urlId,
    url: projectUrl.url,
    normalizedUrl: projectUrl.normalizedUrl,
    addedAt: projectUrl.addedAt,
  };
}

/** Update mutable project fields for the authenticated owner. */
export async function updateProject(
  uid: string,
  projectId: string,
  updates: { name?: string | undefined; description?: string | null | undefined }
): Promise<UpdateProjectResult> {
  const project = await getProjectDoc(projectId);

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }

  if (project.ownerId !== uid) {
    throw new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.");
  }

  const updated = await updateProjectDoc(projectId, updates);

  return {
    projectId: updated.projectId,
    name: updated.name,
    ...(updated.description !== undefined ? { description: updated.description } : {}),
    updatedAt: updated.updatedAt,
  };
}

/**
 * Delete a URL from a project. Validates ownership.
 * Throws 404 if project not found, 403 if not owner.
 */
export async function deleteProjectUrl(
  uid: string,
  projectId: string,
  urlId: string
): Promise<void> {
  const project = await getProjectDoc(projectId);

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }

  if (project.ownerId !== uid) {
    throw new AppError(403, "PROJECT_FORBIDDEN", "You do not have access to this project.");
  }

  await deleteUrlDoc(projectId, urlId);
}
