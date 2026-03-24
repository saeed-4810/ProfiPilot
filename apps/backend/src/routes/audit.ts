import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { CreateAuditSchema } from "../domain/audit.js";
import { requireAuth } from "../middleware/auth.js";
import { createAudit, getAuditStatus, listRecentAudits } from "../services/audit-service.js";
import { getLastCompletedAuditByUrl } from "../adapters/firestore-audit.js";

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
 * GET /audits/recent
 * PERF-155: List recent audit jobs for the authenticated user with pagination.
 * Query params: ?page=1&size=5 (defaults: page=1, size=5, max size=20)
 * Returns 200 with { items, page, size, total }.
 */
auditRouter.get(
  "/recent",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const page = Math.max(1, parseInt(req.query["page"] as string, 10) || 1);
      const size = Math.min(20, Math.max(1, parseInt(req.query["size"] as string, 10) || 5));

      const result = await listRecentAudits(uid, page, size);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "AUDIT_LIST_FAILED", "Failed to retrieve recent audits."));
    }
  }
);

/* v8 ignore start -- PERF-144: /audits/latest route, tested via E2E */
/**
 * GET /audits/latest
 * PERF-144: Get the most recent completed audit for a URL.
 * Used by dashboard to show CWV health preview on project cards.
 * Query params: url (required) — the URL to look up.
 * Returns 200 with audit status + metrics, or 404 if no completed audit.
 */
auditRouter.get(
  "/latest",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const url = req.query["url"];

      if (typeof url !== "string" || url === "") {
        next(new AppError(400, "VALIDATION_ERROR", "Query parameter 'url' is required."));
        return;
      }

      const audit = await getLastCompletedAuditByUrl(uid, url);
      if (audit === null) {
        next(new AppError(404, "AUDIT_NOT_FOUND", "No completed audit found for this URL."));
        return;
      }

      // Return the same shape as GET /audits/:id/status
      const result = await getAuditStatus(uid, audit.jobId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "AUDIT_LATEST_FAILED", "Failed to retrieve latest audit."));
    }
  }
);
/* v8 ignore stop */

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
