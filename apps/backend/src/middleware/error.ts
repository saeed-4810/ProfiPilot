import type { Request, Response, NextFunction } from "express";
import { AppError, createErrorEnvelope } from "../domain/errors.js";
import type { ErrorEnvelope } from "../domain/errors.js";

/**
 * Global error-handling middleware per ADR-003.
 * Catches AppError instances and returns a structured ErrorEnvelope.
 * Unknown errors return 500 with a safe message (no stack traces in production).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorEnvelope>,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.envelope.status).json(err.envelope);
    return;
  }

  const envelope = createErrorEnvelope(
    500,
    "INTERNAL_ERROR",
    "An unexpected error occurred. Please try again later."
  );
  res.status(500).json(envelope);
}
