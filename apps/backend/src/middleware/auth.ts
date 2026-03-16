import type { Request, Response, NextFunction } from "express";
import { getFirebaseApp } from "../lib/firebase.js";
import { AppError } from "../domain/errors.js";
import { SESSION_COOKIE_NAME } from "../domain/auth.js";

/**
 * Express middleware that verifies the session cookie on protected routes.
 * Returns 401 with ErrorEnvelope on invalid/expired/missing session.
 * Per ADR-010: session cookies are verified server-side via Firebase Admin SDK.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sessionCookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE_NAME];

  if (!sessionCookie) {
    next(new AppError(401, "AUTH_NO_SESSION", "Authentication required. No session cookie found."));
    return;
  }

  try {
    const auth = getFirebaseApp().auth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    // Attach decoded claims to request for downstream handlers
    (req as Request & { uid: string }).uid = decoded.uid;
    next();
  } catch {
    next(new AppError(401, "AUTH_SESSION_INVALID", "Session is invalid or expired. Please log in again."));
  }
}
