import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { CreateProjectSchema, AddUrlSchema, UpdateProjectSchema } from "../domain/project.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  addUrl,
  deleteProjectUrl,
} from "../services/project-service.js";
import {
  getProjectHealth,
  getProjectAudits,
  getProjectTrends,
} from "../services/project-health-service.js";

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
      const result = await createProject(uid, parsed.data.name, parsed.data.description);
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
 * PATCH /api/v1/projects/:id
 * CTR-003: Update mutable project fields. Requires authentication and ownership.
 */
projectRouter.patch(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = UpdateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid request body.", parsed.error.flatten()));
      return;
    }

    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;

      const result = await updateProject(uid, projectId, parsed.data);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_UPDATE_FAILED", "Failed to update project."));
    }
  }
);

/**
 * GET /api/v1/projects/:id/health
 * PERF-166: Project health summary with overall score, delta, and per-URL scores.
 * Must be registered BEFORE /:id to avoid Express param matching.
 */
projectRouter.get(
  "/:id/health",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;

      const result = await getProjectHealth(uid, projectId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_HEALTH_FAILED", "Failed to retrieve project health."));
    }
  }
);

/**
 * GET /api/v1/projects/:id/audits
 * PERF-166: Paginated audit history for all URLs in a project.
 * Query params: ?page=1&size=10 (defaults: page=1, size=10)
 */
projectRouter.get(
  "/:id/audits",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;
      const page = Math.max(1, parseInt(req.query["page"] as string, 10) || 1);
      const size = Math.min(50, Math.max(1, parseInt(req.query["size"] as string, 10) || 10));

      const result = await getProjectAudits(uid, projectId, page, size);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_AUDITS_FAILED", "Failed to retrieve project audits."));
    }
  }
);

/**
 * GET /api/v1/projects/:id/trends
 * PERF-166: CrUX field data trends and lab audit history for a project.
 */
projectRouter.get(
  "/:id/trends",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const projectId = req.params["id"] as string;

      const result = await getProjectTrends(uid, projectId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "PROJECT_TRENDS_FAILED", "Failed to retrieve project trends."));
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
