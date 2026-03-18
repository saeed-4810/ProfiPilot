import { AppError } from "../domain/errors.js";
import { normalizeUrl, type Project, type ProjectUrl } from "../domain/project.js";
import {
  createProject as createProjectDoc,
  getProject as getProjectDoc,
  getProjectsByOwner,
  addUrlToProject as addUrlDoc,
  deleteUrl as deleteUrlDoc,
  getProjectUrls,
} from "../adapters/firestore-project.js";

/** Response shape for POST /api/v1/projects (CTR-003). */
export interface CreateProjectResult {
  projectId: string;
  name: string;
  createdAt: string;
}

/** Response shape for GET /api/v1/projects (CTR-003). */
export interface ListProjectsResult {
  page: number;
  size: number;
  total: number;
  items: Project[];
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

/**
 * Create a new project for the authenticated user.
 * Delegates persistence to the Firestore adapter.
 */
export async function createProject(uid: string, name: string): Promise<CreateProjectResult> {
  const project = await createProjectDoc(uid, name);

  return {
    projectId: project.projectId,
    name: project.name,
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

  return {
    page,
    size,
    total,
    items: projects,
  };
}

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
