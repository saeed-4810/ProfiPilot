import { randomUUID } from "node:crypto";

/**
 * Standardized error envelope per ADR-003.
 * All API errors return this shape.
 */
export interface ErrorEnvelope {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  traceId: string;
}

export function createErrorEnvelope(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  traceId?: string
): ErrorEnvelope {
  return {
    status,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    traceId: traceId ?? randomUUID(),
  };
}

/** Application error that carries an ErrorEnvelope payload. */
export class AppError extends Error {
  public readonly envelope: ErrorEnvelope;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.envelope = createErrorEnvelope(status, code, message, details);
  }
}
