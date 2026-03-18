import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { CreateProjectSchema, AddUrlSchema } from "../domain/project.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createProject,
  listProjects,
  getProject,
  addUrl,
  deleteProjectUrl,
} from "../services/project-service.js";

export const projectRouter: RouterType = Router();

/**
 * GET /api/v1/projects
 * CTR-003: List projects for the authenticated user with pagination.
 * Query params: ?page=1&size=20 (defaults: page=1, size=20)
 */
projectRouter.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const page = Math.max(1, parseInt(req.query["page"] as string, 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(req.query["size"] as string, 10) || 20));

      const result = await listProjects(uid, page, size);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_LIST_FAILED", "Failed to retrieve projects."));
    }
  }
);

/**
 * POST /api/v1/projects
 * CTR-003: Create a new project. Requires authentication.
 * Validates name via Zod at handler boundary, delegates to service layer.
 * Returns 201 Created with projectId, name, and createdAt.
 */
projectRouter.post(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid request body.", parsed.error.flatten()));
      return;
    }

    try {
      const uid = (req as Request & { uid: string }).uid;
      const result = await createProject(uid, parsed.data.name);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_CREATE_FAILED", "Failed to create project."));
    }
  }
);

/**
 * GET /api/v1/projects/:id
 * CTR-003: Get a single project with its URLs. Requires authentication.
 * Delegates owner-check and retrieval to service layer.
 * Returns 200 with project details and URL list.
 */
projectRouter.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;

      const result = await getProject(uid, projectId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_GET_FAILED", "Failed to retrieve project."));
    }
  }
);

/**
 * POST /api/v1/projects/:id/urls
 * CTR-004: Add a URL to a project. Requires authentication.
 * Validates URL via Zod at handler boundary, delegates to service layer.
 * Returns 201 Created with urlId, url, normalizedUrl, and addedAt.
 */
projectRouter.post(
  "/:id/urls",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = AddUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid request body.", parsed.error.flatten()));
      return;
    }

    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;

      const result = await addUrl(uid, projectId, parsed.data.url);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_URL_ADD_FAILED", "Failed to add URL to project."));
    }
  }
);

/**
 * DELETE /api/v1/projects/:id/urls/:urlId
 * CTR-004: Remove a URL from a project. Requires authentication.
 * Delegates owner-check and deletion to service layer.
 * Returns 204 No Content on success.
 */
projectRouter.delete(
  "/:id/urls/:urlId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;
      const urlId = req.params["urlId"] as string;

      await deleteProjectUrl(uid, projectId, urlId);
      res.status(204).send();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_URL_DELETE_FAILED", "Failed to delete URL from project."));
    }
  }
);
