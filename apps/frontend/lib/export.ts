const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/* ------------------------------------------------------------------ */
/* Response interfaces — match API spec CTR-009 (PERF-118)            */
/* ------------------------------------------------------------------ */

/** Supported export formats. */
export type ExportFormat = "md" | "pdf";

/** API error envelope per ADR-003. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
}

/* ------------------------------------------------------------------ */
/* Approved copy from docs/ux/003-copy-bank.md                        */
/* ------------------------------------------------------------------ */

// copy: export-load-failed
export const COPY_EXPORT_FAILED = "Failed to generate export. Please try again.";

// copy: audit-not-completed (reused from results)
export const COPY_AUDIT_NOT_COMPLETED = "Audit still processing. Please wait and try again.";

// copy: export-success
export const COPY_EXPORT_SUCCESS = "Report downloaded successfully.";

// copy: export-no-issues
export const COPY_EXPORT_NO_ISSUES = "No issues found — nothing to export.";

// copy: pdf-coming-soon
export const COPY_PDF_COMING_SOON = "Coming Soon";

// copy: export-format-label
export const COPY_FORMAT_LABEL = "Export Format";

// copy: export-download-button
export const COPY_DOWNLOAD_MARKDOWN = "Download Markdown Report";

// copy: export-heading
export const COPY_EXPORT_HEADING = "Export Report";

/* ------------------------------------------------------------------ */
/* Error helper — enriched Error with status + code                   */
/* ------------------------------------------------------------------ */

function throwApiError(response: Response, error: ApiError, fallbackMessage: string): never {
  const err = new Error(error.message || fallbackMessage) as Error & {
    status: number;
    code: string;
  };
  err.status = response.status;
  err.code = error.code ?? "UNKNOWN";
  throw err;
}

/* ------------------------------------------------------------------ */
/* API function                                                        */
/* ------------------------------------------------------------------ */

/**
 * Export a completed audit as a markdown report.
 * GET /audits/:id/export?format=md with session cookie (credentials: "include").
 * Returns the markdown content as a string.
 *
 * The backend returns Content-Type: text/markdown — not JSON.
 * On error, the backend returns JSON error envelope.
 */
export async function exportAudit(auditId: string, format: ExportFormat = "md"): Promise<string> {
  const response = await fetch(`${API_BASE}/audits/${auditId}/export?format=${format}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throwApiError(response, error, COPY_EXPORT_FAILED);
  }

  return await response.text();
}

/* ------------------------------------------------------------------ */
/* Download helper — triggers browser file download from string       */
/* ------------------------------------------------------------------ */

/**
 * Trigger a browser file download from a string content.
 * Creates a Blob, generates an object URL, clicks a hidden anchor, then cleans up.
 */
export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
