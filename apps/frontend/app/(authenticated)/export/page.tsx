"use client";

import { useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MotionWrapper } from "@/components/MotionWrapper";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import {
  exportAudit,
  triggerDownload,
  COPY_EXPORT_FAILED,
  COPY_AUDIT_NOT_COMPLETED,
  COPY_EXPORT_SUCCESS,
  COPY_PDF_COMING_SOON,
  COPY_FORMAT_LABEL,
  COPY_DOWNLOAD_MARKDOWN,
  COPY_EXPORT_HEADING,
  type ExportFormat,
} from "@/lib/export";

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states + special states)        */
/* ------------------------------------------------------------------ */

type PageState = "idle" | "loading" | "success" | "error" | "not-completed" | "not-found";

/* ------------------------------------------------------------------ */
/* ExportPage component                                                */
/* ------------------------------------------------------------------ */

export default function ExportPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auditId = searchParams.get("id");

  /* --- Page-level state --- */
  const [pageState, setPageState] = useState<PageState>(auditId ? "idle" : "not-found");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("md");
  const [error, setError] = useState<string | null>(null);

  /* --- Refs --- */
  const errorRef = useRef<HTMLDivElement>(null);

  /* --- Export handler --- */
  const handleExport = useCallback(async () => {
    /* v8 ignore next 4 -- defensive guard: button only renders when hasAuditId is true */
    if (auditId === null || auditId === "") {
      setPageState("not-found");
      return;
    }

    setPageState("loading");
    setError(null);

    try {
      const markdown = await exportAudit(auditId, selectedFormat);

      if (markdown.trim() === "") {
        setPageState("success");
        return;
      }

      triggerDownload(markdown, `audit-${auditId}-report.md`);
      setPageState("success");
    } catch (err: unknown) {
      const typedErr = err as Error & { status?: number; code?: string };

      if (typedErr.status === 401) {
        router.push("/login");
        return;
      }

      if (typedErr.status === 400 && typedErr.code === "AUDIT_NOT_COMPLETED") {
        setPageState("not-completed");
        return;
      }

      setError(typedErr.message || COPY_EXPORT_FAILED);
      setPageState("error");
      /* v8 ignore next -- errorRef may be null in test environment */
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [auditId, selectedFormat, router]);

  /* --- Retry handler --- */
  const handleRetry = useCallback(() => {
    void handleExport();
  }, [handleExport]);

  /* --- Navigate back to results --- */
  const handleBackToResults = useCallback(() => {
    if (auditId !== null && auditId !== "") {
      router.push(`/results?id=${auditId}`);
      /* v8 ignore next 3 -- defensive guard: button only renders when hasAuditId is true */
    } else {
      router.push("/dashboard");
    }
  }, [auditId, router]);

  /* --- No audit ID --- */
  const hasAuditId = auditId !== null && auditId !== "";

  return (
    <MotionWrapper>
      <main data-testid="export-page" className="min-h-screen p-8 bg-neutral-950 text-neutral-50">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold mb-6">{COPY_EXPORT_HEADING}</h1>

          {/* Not found state — no audit ID */}
          {!hasAuditId && (
            <div data-testid="export-not-found" className="text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-neutral-200">No audit selected</h2>
              <p className="text-neutral-400 mb-4">
                Please select an audit from the dashboard to export.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/dashboard")}
                data-testid="export-back-dashboard"
              >
                Back to Dashboard
              </Button>
            </div>
          )}

          {/* Format selector + export controls — visible when audit ID exists */}
          {hasAuditId && pageState !== "not-found" && (
            <>
              {/* Format selector */}
              <section
                data-testid="format-selector"
                className="mb-8"
                aria-label={COPY_FORMAT_LABEL}
              >
                <h2 className="text-lg font-semibold mb-4 text-neutral-200">{COPY_FORMAT_LABEL}</h2>
                <div className="flex gap-4" role="radiogroup" aria-label={COPY_FORMAT_LABEL}>
                  {/* Markdown option */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedFormat === "md"}
                    onClick={() => setSelectedFormat("md")}
                    data-testid="format-md"
                    className={`flex-1 rounded-lg border p-4 text-left transition-colors border-blue-500 bg-blue-900/20`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-neutral-100">Markdown</span>
                      <Badge label="Available" variant="success" />
                    </div>
                    <p className="text-xs text-neutral-400">
                      Download as .md file — compatible with GitHub, Notion, and most tools.
                    </p>
                  </button>

                  {/* PDF option — coming soon */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedFormat === "pdf"}
                    aria-disabled="true"
                    data-testid="format-pdf"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 text-left opacity-60 cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-neutral-400">PDF</span>
                      <Badge label={COPY_PDF_COMING_SOON} variant="neutral" />
                    </div>
                    <p className="text-xs text-neutral-500">
                      Branded PDF reports — available in a future update.
                    </p>
                  </button>
                </div>
              </section>

              {/* Download button — idle state */}
              {pageState === "idle" && (
                <div data-testid="export-idle">
                  <Button
                    onClick={() => void handleExport()}
                    data-testid="export-download-btn"
                    disabled={selectedFormat !== "md"}
                  >
                    {COPY_DOWNLOAD_MARKDOWN}
                  </Button>
                </div>
              )}

              {/* Loading state — spinner while generating */}
              {pageState === "loading" && (
                <div
                  data-testid="export-loading"
                  role="status"
                  aria-label="Generating export"
                  className="py-8"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="h-6 w-6 animate-spin motion-reduce:animate-none rounded-full border-2 border-neutral-600 border-t-blue-500"
                      data-testid="export-spinner"
                    />
                    <span className="text-sm text-neutral-300">Generating report...</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Skeleton width="100%" height="16px" variant="text" />
                    <Skeleton width="80%" height="16px" variant="text" />
                    <Skeleton width="60%" height="16px" variant="text" />
                  </div>
                </div>
              )}

              {/* Success state — download complete */}
              {pageState === "success" && (
                <div data-testid="export-success" className="py-8">
                  <div
                    role="status"
                    className="mb-6 p-4 rounded-lg bg-green-900/30 border border-green-700 text-green-300"
                  >
                    <p className="text-sm font-medium" data-testid="export-success-message">
                      {COPY_EXPORT_SUCCESS}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={() => void handleExport()} data-testid="export-download-again">
                      Download Again
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleBackToResults}
                      data-testid="export-back-results"
                    >
                      Back to Results
                    </Button>
                  </div>
                </div>
              )}

              {/* Error state — accessible alert with retry */}
              {pageState === "error" && error !== null && (
                <div
                  ref={errorRef}
                  role="alert"
                  tabIndex={-1}
                  data-testid="export-error"
                  className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-500 text-red-200"
                >
                  <p className="text-sm mb-3">{error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetry}
                    data-testid="export-retry"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Not completed state — audit still processing */}
              {pageState === "not-completed" && (
                <div data-testid="export-not-completed" className="text-center py-16">
                  <h2 className="text-xl font-semibold mb-2 text-neutral-200">
                    {COPY_AUDIT_NOT_COMPLETED}
                  </h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetry}
                    data-testid="export-retry-processing"
                    className="mt-4"
                  >
                    Check Again
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}
