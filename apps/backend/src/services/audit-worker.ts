import { AppError } from "../domain/errors.js";
import { AuditStatus } from "../domain/audit.js";
import {
  getAuditJob,
  updateAuditStatus,
  updateAuditMetrics,
  updateAuditDesktopMetrics,
} from "../adapters/firestore-audit.js";
import { fetchPageSpeedData } from "../lib/psi-client.js";
import { parsePSIResponse } from "./metrics-parser.js";

/** Maximum retry attempts per ADR-006. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (1 second). */
const BASE_DELAY_MS = 1_000;

/** Rate limiting delay between PSI API calls per ADR-012 (1 req/sec). */
const RATE_LIMIT_DELAY_MS = 1_000;

/**
 * Sleep for the specified duration. Used for retry backoff and rate limiting.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Determine if an error is retryable per ADR-012 error matrix.
 * - 400 (invalid URL) → NOT retryable
 * - 400 (runtime error) → NOT retryable
 * - 429 (rate limit) → retryable
 * - 502 (server error) → retryable
 * - 504 (timeout) → retryable
 * - Network errors → retryable
 */
function isRetryableError(error: AppError): boolean {
  const retryableCodes = new Set([
    "PSI_RATE_LIMITED",
    "PSI_SERVER_ERROR",
    "PSI_TIMEOUT",
    "PSI_NETWORK_ERROR",
  ]);
  return retryableCodes.has(error.envelope.code);
}

/**
 * Calculate delay before next retry using exponential backoff.
 * For rate limit errors, uses the Retry-After header if available.
 */
function getRetryDelay(error: AppError, attempt: number): number {
  if (error.envelope.code === "PSI_RATE_LIMITED") {
    const details = error.envelope.details as { retryAfter?: number } | undefined;
    if (details?.retryAfter && details.retryAfter > 0) {
      return details.retryAfter * 1_000;
    }
  }
  // Exponential backoff: 1s, 2s, 4s
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Process an audit job: fetch PSI data, parse metrics, store in Firestore.
 *
 * Flow per ADR-012 data flow diagram:
 * 1. Read job from Firestore
 * 2. Update status to "running"
 * 3. Call PSI API
 * 4. Parse response
 * 5. Store metrics in Firestore
 * 6. Update status to "completed"
 *
 * Error handling per ADR-012 error matrix with retry per ADR-006.
 */
export async function processAuditJob(jobId: string): Promise<void> {
  // Step 1: Read job from Firestore
  const job = await getAuditJob(jobId);
  if (!job) {
    return;
  }

  // Only process jobs in queued state
  if (job.status !== AuditStatus.QUEUED) {
    return;
  }

  // Step 2: Update status to running
  await updateAuditStatus(jobId, AuditStatus.RUNNING);

  let lastError: AppError | undefined;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      // Rate limiting: enforce 1 req/sec between calls
      if (attempt > 0) {
        const delay = getRetryDelay(lastError!, attempt - 1);
        await updateAuditStatus(jobId, AuditStatus.RETRYING, {
          retryCount: attempt,
          lastError: lastError!.message,
        });
        await sleep(delay);
        await updateAuditStatus(jobId, AuditStatus.RUNNING);
      } else {
        // Rate limit delay before first call too (1 req/sec global)
        await sleep(RATE_LIMIT_DELAY_MS);
      }

      // Step 3: Call PSI API
      if (job.strategy === "both") {
        // "both" strategy: run mobile first, then desktop
        const mobileResponse = await fetchPageSpeedData(job.url, "mobile");
        const mobileMetrics = parsePSIResponse(mobileResponse);
        await updateAuditMetrics(jobId, mobileMetrics);

        // Rate limit delay between calls (1 req/sec)
        await sleep(RATE_LIMIT_DELAY_MS);

        const desktopResponse = await fetchPageSpeedData(job.url, "desktop");
        const desktopMetrics = parsePSIResponse(desktopResponse);
        await updateAuditDesktopMetrics(jobId, desktopMetrics);
      } else {
        const psiResponse = await fetchPageSpeedData(job.url, job.strategy);
        const metrics = parsePSIResponse(psiResponse);
        await updateAuditMetrics(jobId, metrics);
      }

      // Step 6: Update status to completed
      await updateAuditStatus(jobId, AuditStatus.COMPLETED);
      return;
    } catch (error: unknown) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              500,
              "PSI_UNKNOWN_ERROR",
              error instanceof Error ? error.message : "Unknown error during audit processing"
            );

      lastError = appError;

      // Non-retryable errors fail immediately
      if (!isRetryableError(appError)) {
        await updateAuditStatus(jobId, AuditStatus.FAILED, {
          lastError: appError.message,
          retryCount: attempt,
        });
        return;
      }

      // Last attempt exhausted — fail after loop
      if (attempt === MAX_RETRIES) {
        break;
      }

      attempt++;
    }
  }

  // All retries exhausted — mark as failed
  await updateAuditStatus(jobId, AuditStatus.FAILED, {
    lastError: `Max retries exceeded: ${lastError!.message}`,
    retryCount: MAX_RETRIES,
  });
}
