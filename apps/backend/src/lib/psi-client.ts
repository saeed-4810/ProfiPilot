import { AppError } from "../domain/errors.js";
import type { AuditStrategy } from "../domain/audit.js";

/** Timeout for PSI API requests per ADR-012 (30 seconds). */
const PSI_TIMEOUT_MS = 30_000;

/** Base URL for the PageSpeed Insights API v5. */
const PSI_BASE_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Typed subset of the PSI API v5 response relevant to CWV extraction.
 * Full response is much larger — we only type the paths we consume per ADR-012.
 */
export interface PSIAuditItem {
  numericValue?: number | undefined;
  score?: number | null | undefined;
}

export interface PSIResponse {
  lighthouseResult?:
    | {
        lighthouseVersion?: string | undefined;
        audits?: Record<string, PSIAuditItem> | undefined;
        categories?:
          | {
              performance?:
                | {
                    score?: number | null | undefined;
                  }
                | undefined;
            }
          | undefined;
        runtimeError?:
          | {
              code?: string | undefined;
              message?: string | undefined;
            }
          | undefined;
      }
    | undefined;
  loadingExperience?:
    | {
        metrics?: Record<string, unknown> | undefined;
      }
    | undefined;
}

/** Google API error envelope format. */
interface PSIErrorResponse {
  error?:
    | {
        code?: number | undefined;
        message?: string | undefined;
        errors?: Array<{ reason?: string | undefined }> | undefined;
      }
    | undefined;
}

/**
 * Fetch PageSpeed Insights data for a URL.
 * Uses native fetch (Node 18+) with AbortController for timeout.
 *
 * @throws AppError with appropriate status for API failures per ADR-012 error matrix.
 */
export async function fetchPageSpeedData(
  url: string,
  strategy: AuditStrategy
): Promise<PSIResponse> {
  const apiKey = process.env["PAGESPEED_API_KEY"] ?? "";

  const params = new URLSearchParams({
    url,
    category: "performance",
    strategy,
  });

  if (apiKey) {
    params.set("key", apiKey);
  }

  const requestUrl = `${PSI_BASE_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as PSIErrorResponse;
      const message = body.error?.message ?? `PSI API returned ${String(response.status)}`;
      const reason = body.error?.errors?.[0]?.reason;

      if (response.status === 400) {
        throw new AppError(400, "PSI_INVALID_URL", `Invalid URL: ${message}`);
      }

      if (response.status === 429 || (response.status === 403 && reason === "rateLimitExceeded")) {
        const retryAfter = response.headers.get("Retry-After");
        throw new AppError(429, "PSI_RATE_LIMITED", `Rate limited by PSI API: ${message}`, {
          retryAfter: retryAfter ? Number(retryAfter) : undefined,
        });
      }

      if (response.status >= 500) {
        throw new AppError(502, "PSI_SERVER_ERROR", `PSI API server error: ${message}`);
      }

      throw new AppError(502, "PSI_UNEXPECTED_ERROR", `Unexpected PSI API error: ${message}`);
    }

    const data = (await response.json()) as PSIResponse;

    // Check for Lighthouse runtime errors inside a 200 response (PSI API gotcha)
    if (data.lighthouseResult?.runtimeError?.code) {
      const runtimeMsg = data.lighthouseResult.runtimeError.message ?? "Lighthouse runtime error";
      throw new AppError(400, "PSI_RUNTIME_ERROR", `Lighthouse error: ${runtimeMsg}`);
    }

    return data;
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }

    // AbortController timeout
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "PSI_TIMEOUT", "PSI API request timed out after 30 seconds.");
    }

    // Network errors (DNS, connection refused, etc.)
    if (
      error instanceof TypeError &&
      (error.message.includes("fetch") || error.message.includes("network"))
    ) {
      throw new AppError(
        502,
        "PSI_NETWORK_ERROR",
        `Network error calling PSI API: ${error.message}`
      );
    }

    // Unknown errors — wrap as network error
    const msg = error instanceof Error ? error.message : "Unknown error";
    throw new AppError(502, "PSI_NETWORK_ERROR", `Failed to call PSI API: ${msg}`);
    /* v8 ignore next 3 — finally always runs; v8 reports phantom branch for exception vs normal flow */
  } finally {
    clearTimeout(timeoutId);
  }
}
