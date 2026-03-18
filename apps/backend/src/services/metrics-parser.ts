import type { PSIResponse } from "../lib/psi-client.js";
import type { AuditMetrics } from "../domain/audit.js";

/**
 * Extract a numeric metric value from the PSI response audits object.
 * Returns null if the audit item or numericValue is missing.
 */
function extractNumericValue(
  audits: Record<string, { numericValue?: number | undefined }> | undefined,
  auditId: string
): number | null {
  const item = audits?.[auditId];
  if (item === undefined || item.numericValue === undefined) {
    return null;
  }
  return item.numericValue;
}

/**
 * Parse a PSI API response into the AuditMetrics shape per ADR-012.
 * Handles missing metrics gracefully — any metric may be null for certain URLs.
 *
 * Metric source paths (per ADR-012 §Metrics Stored):
 * - lcp: lighthouseResult.audits['largest-contentful-paint'].numericValue
 * - cls: lighthouseResult.audits['cumulative-layout-shift'].numericValue
 * - tbt: lighthouseResult.audits['total-blocking-time'].numericValue
 * - fcp: lighthouseResult.audits['first-contentful-paint'].numericValue
 * - ttfb: lighthouseResult.audits['server-response-time'].numericValue
 * - si: lighthouseResult.audits['speed-index'].numericValue
 * - performanceScore: lighthouseResult.categories.performance.score
 * - lighthouseVersion: lighthouseResult.lighthouseVersion
 * - fieldData: loadingExperience.metrics
 */
export function parsePSIResponse(response: PSIResponse): AuditMetrics {
  const audits = response.lighthouseResult?.audits;

  return {
    lcp: extractNumericValue(audits, "largest-contentful-paint"),
    cls: extractNumericValue(audits, "cumulative-layout-shift"),
    tbt: extractNumericValue(audits, "total-blocking-time"),
    fcp: extractNumericValue(audits, "first-contentful-paint"),
    ttfb: extractNumericValue(audits, "server-response-time"),
    si: extractNumericValue(audits, "speed-index"),
    performanceScore: response.lighthouseResult?.categories?.performance?.score ?? null,
    lighthouseVersion: response.lighthouseResult?.lighthouseVersion ?? null,
    fieldData: response.loadingExperience?.metrics ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
