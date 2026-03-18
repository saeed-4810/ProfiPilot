import { z } from "zod";

/**
 * Zod schema for POST /api/v1/projects request body (CTR-003).
 * Validates project name: non-empty string, max 100 characters.
 */
export const CreateProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required.")
    .max(100, "Project name must be 100 characters or fewer."),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectSchema>;

/**
 * Zod schema for POST /api/v1/projects/:id/urls request body (CTR-004).
 * Validates URL: must be a valid HTTPS URL.
 */
export const AddUrlSchema = z.object({
  url: z
    .string()
    .url("A valid URL is required.")
    .refine((val) => val.startsWith("https://"), {
      message: "Only HTTPS URLs are allowed.",
    }),
});

export type AddUrlRequest = z.infer<typeof AddUrlSchema>;

/** Firestore document shape for the `projects` collection per DB schema v2. */
export interface Project {
  projectId: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Firestore document shape for the `urls` subcollection per DB schema v2. */
export interface ProjectUrl {
  urlId: string;
  projectId: string;
  url: string;
  normalizedUrl: string;
  addedAt: string;
}

/**
 * Zod schema for runtime validation of Firestore project documents (W5).
 * Guards against corrupt or unexpected data from the database.
 */
export const ProjectSchema = z.object({
  projectId: z.string(),
  ownerId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Zod schema for runtime validation of Firestore URL documents (W5).
 * Guards against corrupt or unexpected data from the database.
 */
export const ProjectUrlSchema = z.object({
  urlId: z.string(),
  projectId: z.string(),
  url: z.string(),
  normalizedUrl: z.string(),
  addedAt: z.string(),
});

/**
 * Normalize a URL for deduplication and consistency.
 * Lowercases hostname, strips trailing slash, removes explicit default ports.
 * Note: The URL constructor already strips default ports (443/HTTPS, 80/HTTP),
 * so we only need to handle non-default explicit ports via the URL API.
 */
export function normalizeUrl(raw: string): string {
  const parsed = new URL(raw);
  parsed.hostname = parsed.hostname.toLowerCase();

  let result = parsed.toString();

  // Strip trailing slash (unless path is more than just "/")
  if (result.endsWith("/") && parsed.pathname === "/") {
    result = result.slice(0, -1);
  }

  return result;
}
