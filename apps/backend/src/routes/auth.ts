import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { getFirebaseApp } from "../lib/firebase.js";
import { AppError } from "../domain/errors.js";
import { VerifyTokenSchema, SESSION_COOKIE_NAME, SESSION_EXPIRY_MS } from "../domain/auth.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter: RouterType = Router();

/**
 * POST /auth/verify-token
 * CTR-001: Verify Firebase ID token and set session cookie.
 * Per ADR-010 step 1-2: Client authenticates → server verifies → sets HTTP-only session cookie.
 */
authRouter.post(
  "/verify-token",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = VerifyTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid request body.", parsed.error.flatten()));
      return;
    }

    try {
      const auth = getFirebaseApp().auth();

      // Verify the ID token first to ensure it is valid and not expired
      const decoded = await auth.verifyIdToken(parsed.data.idToken);

      // Only allow tokens that were issued recently (within 5 minutes) to prevent replay
      const issuedAt = decoded.iat * 1000;
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (issuedAt < fiveMinutesAgo) {
        next(new AppError(401, "AUTH_TOKEN_STALE", "Token is too old. Please re-authenticate."));
        return;
      }

      // Create a session cookie with the configured expiry
      const sessionCookie = await auth.createSessionCookie(parsed.data.idToken, {
        expiresIn: SESSION_EXPIRY_MS,
      });

      // Set HTTP-only, Secure, SameSite=Strict cookie per ADR-010
      res.cookie(SESSION_COOKIE_NAME, sessionCookie, {
        maxAge: SESSION_EXPIRY_MS,
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "strict",
        path: "/",
      });

      res.status(200).json({ status: "authenticated", uid: decoded.uid });
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(401, "AUTH_TOKEN_INVALID", "Firebase ID token is invalid or expired."));
    }
  }
);

/**
 * GET /auth/session
 * CTR-002: Check session validity.
 * Per ADR-010 step 3: Server validates session cookie on each request.
 */
authRouter.get("/session", requireAuth, (req: Request, res: Response): void => {
  const uid = (req as Request & { uid: string }).uid;
  res.status(200).json({ status: "valid", uid });
});

/**
 * POST /auth/logout
 * CTR-002: Revoke refresh token and clear session cookie.
 * Per ADR-010 step 5: Client calls logout → server revokes refresh token + clears session cookie.
 */
authRouter.post(
  "/logout",
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const sessionCookie = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];

    // Clear the cookie regardless of whether verification succeeds
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });

    if (!sessionCookie) {
      // No session to revoke — still a successful logout
      res.status(200).json({ status: "logged_out" });
      return;
    }

    try {
      const auth = getFirebaseApp().auth();
      const decoded = await auth.verifySessionCookie(sessionCookie);
      // Revoke all refresh tokens for this user per ADR-010
      await auth.revokeRefreshTokens(decoded.uid);
      res.status(200).json({ status: "logged_out" });
    } catch {
      // Cookie was invalid/expired — still clear it and return success
      res.status(200).json({ status: "logged_out" });
    }
  }
);
