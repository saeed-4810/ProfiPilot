import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  exportAudit,
  triggerDownload,
  COPY_EXPORT_FAILED,
  COPY_EXPORT_SUCCESS,
  COPY_AUDIT_NOT_COMPLETED,
  COPY_EXPORT_NO_ISSUES,
  COPY_PDF_COMING_SOON,
  COPY_FORMAT_LABEL,
  COPY_DOWNLOAD_MARKDOWN,
  COPY_EXPORT_HEADING,
} from "../../lib/export";

// --- Global fetch mock ---
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* T-PERF-103-001: Calls GET /audits/:id/export?format=md             */
/* ------------------------------------------------------------------ */

describe("T-PERF-103-001: Calls GET /audits/:id/export?format=md", () => {
  it("sends GET /audits/:id/export?format=md with credentials", async () => {
    const markdownContent = "# Audit Report\n\n## Summary\nAll good.";
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => markdownContent,
    });

    const result = await exportAudit("audit-123", "md");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/audits/audit-123/export?format=md",
      {
        method: "GET",
        credentials: "include",
      }
    );
    expect(result).toBe(markdownContent);
  });

  it("defaults to md format when no format specified", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "# Report",
    });

    await exportAudit("audit-456");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/audits/audit-456/export?format=md",
      {
        method: "GET",
        credentials: "include",
      }
    );
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-103-002: Handles 400 AUDIT_NOT_COMPLETED                    */
/* ------------------------------------------------------------------ */

describe("T-PERF-103-002: Handles 400 AUDIT_NOT_COMPLETED", () => {
  it("throws with status 400 and code AUDIT_NOT_COMPLETED", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        code: "AUDIT_NOT_COMPLETED",
        message: "Audit still processing",
      }),
    });

    await expect(exportAudit("audit-pending")).rejects.toMatchObject({
      message: "Audit still processing",
      status: 400,
      code: "AUDIT_NOT_COMPLETED",
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-103-003: 401 → redirect to /login (error thrown)            */
/* ------------------------------------------------------------------ */

describe("T-PERF-103-003: 401 → throws auth error", () => {
  it("throws with status 401 on auth failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Authentication required",
      }),
    });

    await expect(exportAudit("audit-123")).rejects.toMatchObject({
      message: "Authentication required",
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });
});

/* ------------------------------------------------------------------ */
/* exportAudit — additional error scenarios                            */
/* ------------------------------------------------------------------ */

describe("exportAudit error handling", () => {
  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(exportAudit("audit-123")).rejects.toMatchObject({
      message: COPY_EXPORT_FAILED,
      code: "UNKNOWN",
    });
  });

  it("throws with status 404 on not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "AUDIT_NOT_FOUND",
        message: "Audit not found",
      }),
    });

    await expect(exportAudit("nonexistent")).rejects.toMatchObject({
      message: "Audit not found",
      status: 404,
      code: "AUDIT_NOT_FOUND",
    });
  });
});

/* ------------------------------------------------------------------ */
/* triggerDownload                                                      */
/* ------------------------------------------------------------------ */

describe("triggerDownload", () => {
  it("creates a blob, anchor element, clicks it, and cleans up", () => {
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const mockRevokeObjectURL = vi.fn();

    const mockAnchor = {
      href: "",
      download: "",
      style: { display: "" },
      click: mockClick,
    } as unknown as HTMLAnchorElement;

    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(mockAppendChild);
    vi.spyOn(document.body, "removeChild").mockImplementation(mockRemoveChild);
    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    triggerDownload("# Report content", "report.md");

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockAnchor.href).toBe("blob:mock-url");
    expect(mockAnchor.download).toBe("report.md");
    expect(mockAnchor.style.display).toBe("none");
    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockClick).toHaveBeenCalledOnce();
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

/* ------------------------------------------------------------------ */
/* Copy constants                                                      */
/* ------------------------------------------------------------------ */

describe("Copy constants", () => {
  it("exports all required copy strings", () => {
    expect(COPY_EXPORT_FAILED).toBe("Failed to generate export. Please try again.");
    expect(COPY_AUDIT_NOT_COMPLETED).toBe("Audit still processing. Please wait and try again.");
    expect(COPY_EXPORT_SUCCESS).toBe("Report downloaded successfully.");
    expect(COPY_EXPORT_NO_ISSUES).toBe("No issues found — nothing to export.");
    expect(COPY_PDF_COMING_SOON).toBe("Coming Soon");
    expect(COPY_FORMAT_LABEL).toBe("Export Format");
    expect(COPY_DOWNLOAD_MARKDOWN).toBe("Download Markdown Report");
    expect(COPY_EXPORT_HEADING).toBe("Export Report");
  });
});
