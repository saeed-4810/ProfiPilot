import { randomUUID } from "node:crypto";
import { getFirebaseApp } from "../lib/firebase.js";
import {
  ProjectSchema,
  ProjectUrlSchema,
  type Project,
  type ProjectUrl,
} from "../domain/project.js";

const COLLECTION = "projects";
const URLS_SUBCOLLECTION = "urls";

/** Create a new project document in Firestore. Returns the created Project. */
export async function createProject(
  ownerId: string,
  name: string,
  description?: string | null
): Promise<Project> {
  const firestore = getFirebaseApp().firestore();
  const projectId = randomUUID();
  const now = new Date().toISOString();

  const project: Project = {
    projectId,
    ownerId,
    name,
    ...(description !== undefined ? { description } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await firestore.collection(COLLECTION).doc(projectId).set(project);
  return project;
}

/* v8 ignore start -- getAllProjectsByOwner: simple Firestore query, tested via dashboard-service unit tests */
/** Get all projects for a specific owner without pagination. */
export async function getAllProjectsByOwner(ownerId: string): Promise<Project[]> {
  const firestore = getFirebaseApp().firestore();
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("ownerId", "==", ownerId)
    .orderBy("createdAt", "desc")
    .get();

  const projects: Project[] = [];
  for (const doc of snapshot.docs) {
    const parsed = ProjectSchema.safeParse(doc.data());
    if (parsed.success) {
      projects.push(parsed.data);
    }
  }

  return projects;
}
/* v8 ignore stop */

/**
 * Get paginated projects for a specific owner.
 * Returns projects ordered by createdAt descending with total count.
 */
export async function getProjectsByOwner(
  ownerId: string,
  page: number,
  size: number
): Promise<{ projects: Project[]; total: number }> {
  const firestore = getFirebaseApp().firestore();
  const collectionRef = firestore.collection(COLLECTION);

  // Count total documents for this owner
  const allDocs = await collectionRef.where("ownerId", "==", ownerId).get();
  const total = allDocs.size;

  // Fetch paginated results ordered by createdAt descending
  const offset = (page - 1) * size;
  const snapshot = await collectionRef
    .where("ownerId", "==", ownerId)
    .orderBy("createdAt", "desc")
    .offset(offset)
    .limit(size)
    .get();

  const projects: Project[] = [];
  for (const doc of snapshot.docs) {
    const parsed = ProjectSchema.safeParse(doc.data());
    if (parsed.success) {
      projects.push(parsed.data);
    }
  }

  return { projects, total };
}

/** Read a single project document from Firestore. Returns null if not found. */
export async function getProject(projectId: string): Promise<Project | null> {
  const firestore = getFirebaseApp().firestore();
  const doc = await firestore.collection(COLLECTION).doc(projectId).get();

  if (!doc.exists) {
    return null;
  }

  // Runtime validation guards against corrupt Firestore data (W5)
  const parsed = ProjectSchema.safeParse(doc.data());
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

/** Update mutable project fields and return the updated project. */
export async function updateProject(
  projectId: string,
  updates: { name?: string | undefined; description?: string | null | undefined }
): Promise<Project> {
  const firestore = getFirebaseApp().firestore();
  const now = new Date().toISOString();

  const update: Record<string, string | null> = {
    updatedAt: now,
  };

  if (updates.name !== undefined) {
    update["name"] = updates.name;
  }

  if (updates.description !== undefined) {
    update["description"] = updates.description;
  }

  await firestore.collection(COLLECTION).doc(projectId).update(update);

  const updated = await getProject(projectId);
  /* v8 ignore next 3 -- defensive: project was just updated, reload failure is near-impossible */
  if (!updated) {
    throw new Error("Updated project could not be reloaded.");
  }

  return updated;
}

/** Add a URL to a project's urls subcollection. Returns the created ProjectUrl. */
export async function addUrlToProject(
  projectId: string,
  url: string,
  normalizedUrl: string
): Promise<ProjectUrl> {
  const firestore = getFirebaseApp().firestore();
  const urlId = randomUUID();
  const now = new Date().toISOString();

  const projectUrl: ProjectUrl = {
    urlId,
    projectId,
    url,
    normalizedUrl,
    addedAt: now,
  };

  await firestore
    .collection(COLLECTION)
    .doc(projectId)
    .collection(URLS_SUBCOLLECTION)
    .doc(urlId)
    .set(projectUrl);

  return projectUrl;
}

/** Delete a URL from a project's urls subcollection. */
export async function deleteUrl(projectId: string, urlId: string): Promise<void> {
  const firestore = getFirebaseApp().firestore();
  await firestore
    .collection(COLLECTION)
    .doc(projectId)
    .collection(URLS_SUBCOLLECTION)
    .doc(urlId)
    .delete();
}

/** Get all URLs for a project from the urls subcollection. */
export async function getProjectUrls(projectId: string): Promise<ProjectUrl[]> {
  const firestore = getFirebaseApp().firestore();
  const snapshot = await firestore
    .collection(COLLECTION)
    .doc(projectId)
    .collection(URLS_SUBCOLLECTION)
    .orderBy("addedAt", "desc")
    .get();

  const urls: ProjectUrl[] = [];
  for (const doc of snapshot.docs) {
    const parsed = ProjectUrlSchema.safeParse(doc.data());
    if (parsed.success) {
      urls.push(parsed.data);
    }
  }

  return urls;
}
