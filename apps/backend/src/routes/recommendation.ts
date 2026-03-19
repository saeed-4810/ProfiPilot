import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getAuditRecommendations,
  getAuditSummary,
  regenerateRecommendations,
} from "../services/recommendation-service.js";

export const recommendationRouter: RouterType = Router();

/**
 * GET /audits/:id/recommendations
 * CTR-007: Get rule engine recommendations for a completed audit.
 * Requires authentication. Owner-only access.
 * Returns 200 with auditId + recommendations array.
 */
recommendationRouter.get(
  "/:id/recommendations",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const auditId = req.params["id"] as string;

      const result = await getAuditRecommendations(uid, auditId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "RECOMMENDATION_FETCH_FAILED", "Failed to fetch recommendations."));
    }
  }
);

/**
 * GET /audits/:id/summary
 * CTR-008: Get AI-enhanced summary for a completed audit.
 * Requires authentication. Owner-only access.
 * Returns 200 with executive summary + tickets (AI or fallback).
 */
recommendationRouter.get(
  "/:id/summary",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const auditId = req.params["id"] as string;

      const result = await getAuditSummary(uid, auditId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "SUMMARY_FETCH_FAILED", "Failed to fetch summary."));
    }
  }
);

/**
 * POST /audits/:id/recommendations/regenerate
 * Queues a new AI summary generation for a completed audit.
 * Requires authentication. Owner-only access.
 * Returns 202 with generationId + status "queued".
 */
recommendationRouter.post(
  "/:id/recommendations/regenerate",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const auditId = req.params["id"] as string;

      const result = await regenerateRecommendations(uid, auditId);
      res.status(202).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "REGENERATE_FAILED", "Failed to queue regeneration."));
    }
  }
);
