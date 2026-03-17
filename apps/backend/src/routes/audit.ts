import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { CreateAuditSchema } from "../domain/audit.js";
import { requireAuth } from "../middleware/auth.js";
import { createAudit, getAuditStatus } from "../services/audit-service.js";

export const auditRouter: RouterType = Router();

/**
 * POST /audits
 * CTR-005: Create a new audit job. Requires authentication.
 * Validates URL via Zod at handler boundary, delegates to service layer.
 * Returns 202 Accepted with jobId, status, and createdAt.
 */
auditRouter.post(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = CreateAuditSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid request body.", parsed.error.flatten()));
      return;
    }

    try {
      const uid = (req as Request & { uid: string }).uid;
      const result = await createAudit(uid, parsed.data.url);
      res.status(202).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "AUDIT_CREATE_FAILED", "Failed to create audit job."));
    }
  }
);

/**
 * GET /audits/:id/status
 * CTR-006: Get audit job status. Requires authentication.
 * Delegates owner-check and retrieval to service layer.
 * Returns 200 with job status, retryCount, timestamps, and optional error.
 */
auditRouter.get(
  "/:id/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      // Express guarantees `:id` param is a non-empty string for this route pattern
      const jobId = req.params["id"] as string;

      const result = await getAuditStatus(uid, jobId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "AUDIT_STATUS_FAILED", "Failed to retrieve audit status."));
    }
  }
);
