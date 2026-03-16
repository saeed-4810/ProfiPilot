import { z } from "zod";

/** Zod schema for POST /auth/verify-token request body. */
export const VerifyTokenSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

export type VerifyTokenRequest = z.infer<typeof VerifyTokenSchema>;

/** Session cookie configuration per ADR-010. */
export const SESSION_COOKIE_NAME = "__session";

/** 5 days in milliseconds (per ADR-010). */
export const SESSION_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000;
