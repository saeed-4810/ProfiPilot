import { Router, type NextFunction, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import { AppError } from "../domain/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { getDashboardStats } from "../services/dashboard-service.js";

export const dashboardRouter: RouterType = Router();

/**
 * GET /dashboard/stats
 * CTR-010: Aggregate dashboard stats for the authenticated user.
 */
dashboardRouter.get(
  "/stats",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = (req as Request & { uid: string }).uid;
      const result = await getDashboardStats(uid);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(500, "DASHBOARD_STATS_FAILED", "Failed to retrieve dashboard stats."));
    }
  }
);
