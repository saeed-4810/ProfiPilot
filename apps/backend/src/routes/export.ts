import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { generateExport } from "../services/export-service.js";

export const exportRouter: RouterType = Router();

/**
 * GET /audits/:id/export?format=md
 * CTR-009: Export a completed audit as a markdown report.
 * Requires authentication. Owner-only access.
 * Returns 200 with Content-Type text/markdown.
 * Returns 422 for unsupported formats (e.g., pdf — deferred per ADR-015 §5).
 */
exportRouter.get(
  "/:id/export",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const auditId = req.params["id"] as string;
      const format = req.query["format"] as string | undefined;

      const markdown = await generateExport(uid, auditId, format ?? "md");

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.status(200).send(markdown);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "EXPORT_FAILED", "Failed to generate export."));
    }
  }
);
