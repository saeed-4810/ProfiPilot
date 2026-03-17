import type { Request, Response, NextFunction } from "express";
import { getFirebaseApp } from "../lib/firebase.js";
import { AppError } from "../domain/errors.js";
import { SESSION_COOKIE_NAME } from "../domain/auth.js";

/**
 * Express middleware that verifies the session cookie on protected routes.
 * Supports two cookie formats:
 *   1. Firebase session cookie (created via createSessionCookie — Blaze plan)
 *   2. Firebase ID token stored as cookie (fallback for Spark plan)
 * Returns 401 with ErrorEnvelope on invalid/expired/missing session.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sessionCookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE_NAME];

  if (!sessionCookie) {
    next(new AppError(401, "AUTH_NO_SESSION", "Authentication required. No session cookie found."));
    return;
  }

  try {
    const auth = getFirebaseApp().auth();

    // Try verifying as a session cookie first (Blaze plan)
    try {
      const decoded = await auth.verifySessionCookie(sessionCookie, true);
      (req as Request & { uid: string }).uid = decoded.uid;
      next();
      return;
    } catch {
      // Not a valid session cookie — try as an ID token (Spark plan fallback)
    }

    // Fallback: verify as a regular ID token
    const decoded = await auth.verifyIdToken(sessionCookie);
    (req as Request & { uid: string }).uid = decoded.uid;
    next();
  } catch {
    next(
      new AppError(
        401,
        "AUTH_SESSION_INVALID",
        "Session is invalid or expired. Please log in again."
      )
    );
  }
}
