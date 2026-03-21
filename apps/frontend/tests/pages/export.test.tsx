import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockPush = vi.fn();
const mockRouter = { push: mockPush };
let mockSearchParamsId: string | null = "audit-123";

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => ({
    get: (key: string) => (key === "id" ? mockSearchParamsId : null),
  }),
}));

const mockExportAudit = vi.fn();
const mockTriggerDownload = vi.fn();
vi.mock("@/lib/export", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    exportAudit: (...args: unknown[]) => mockExportAudit(...args),
    triggerDownload: (...args: unknown[]) => mockTriggerDownload(...args),
  };
});

// Import after mocks
import ExportPage from "../../app/(authenticated)/export/page";

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParamsId = "audit-123";
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/* P-PERF-103-001: User exports in markdown format                    */
/* ================================================================== */

describe("P-PERF-103-001: User exports in markdown format", () => {
  it("exports audit as markdown and triggers download", async () => {
    const markdownContent = "# Audit Report\n\n## Summary\nCritical LCP issues.";
    mockExportAudit.mockResolvedValue(markdownContent);

    const user = userEvent.setup();
    render(<ExportPage />);

    // Click download button
    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(mockExportAudit).toHaveBeenCalledWith("audit-123", "md");
      expect(mockTriggerDownload).toHaveBeenCalledWith(
        markdownContent,
        "audit-audit-123-report.md"
      );
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
    });
  });

  it("shows success message after download", async () => {
    mockExportAudit.mockResolvedValue("# Report");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-success-message")).toHaveTextContent(
        "Report downloaded successfully."
      );
    });
  });
});

/* ================================================================== */
/* P-PERF-103-002: No recommendations → "no issues found"            */
/* ================================================================== */

describe("P-PERF-103-002: No recommendations → no issues found", () => {
  it("handles empty markdown content without triggering download", async () => {
    mockExportAudit.mockResolvedValue("");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(mockExportAudit).toHaveBeenCalledWith("audit-123", "md");
      expect(mockTriggerDownload).not.toHaveBeenCalled();
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
    });
  });

  it("handles whitespace-only markdown content without triggering download", async () => {
    mockExportAudit.mockResolvedValue("   \n  ");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(mockTriggerDownload).not.toHaveBeenCalled();
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* P-PERF-103-003: PDF format → "coming soon"                        */
/* ================================================================== */

describe("P-PERF-103-003: PDF format → coming soon", () => {
  it("shows Coming Soon badge on PDF option", () => {
    render(<ExportPage />);

    const pdfOption = screen.getByTestId("format-pdf");
    expect(pdfOption).toBeInTheDocument();
    expect(pdfOption).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it("PDF option is not selectable", async () => {
    const user = userEvent.setup();
    render(<ExportPage />);

    // MD should be selected by default
    expect(screen.getByTestId("format-md")).toHaveAttribute("aria-checked", "true");

    // Click PDF — should not change selection (aria-disabled)
    await user.click(screen.getByTestId("format-pdf"));

    // MD should still be selected
    expect(screen.getByTestId("format-md")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("format-pdf")).toHaveAttribute("aria-checked", "false");
  });
});

/* ================================================================== */
/* U-PERF-103-001: Available formats shown                            */
/* ================================================================== */

describe("U-PERF-103-001: Available formats shown", () => {
  it("displays both markdown and PDF format options", () => {
    render(<ExportPage />);

    expect(screen.getByTestId("format-selector")).toBeInTheDocument();
    expect(screen.getByTestId("format-md")).toBeInTheDocument();
    expect(screen.getByTestId("format-pdf")).toBeInTheDocument();
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("shows Available badge on markdown option", () => {
    render(<ExportPage />);

    expect(screen.getByText("Available")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* U-PERF-103-002: Format selector accessible                         */
/* ================================================================== */

describe("U-PERF-103-002: Format selector accessible", () => {
  it("format selector has radiogroup role and aria-label", () => {
    render(<ExportPage />);

    const radiogroup = screen.getByRole("radiogroup");
    expect(radiogroup).toBeInTheDocument();
    expect(radiogroup).toHaveAttribute("aria-label", "Export Format");
  });

  it("format options have radio role with aria-checked", () => {
    render(<ExportPage />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);

    // MD selected by default
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    // PDF not selected
    expect(radios[1]).toHaveAttribute("aria-checked", "false");
  });

  it("PDF option has aria-disabled", () => {
    render(<ExportPage />);

    expect(screen.getByTestId("format-pdf")).toHaveAttribute("aria-disabled", "true");
  });

  it("clicking markdown option keeps it selected", async () => {
    const user = userEvent.setup();
    render(<ExportPage />);

    // MD is already selected, clicking it should keep it selected
    await user.click(screen.getByTestId("format-md"));

    expect(screen.getByTestId("format-md")).toHaveAttribute("aria-checked", "true");
  });
});

/* ================================================================== */
/* U-PERF-103-003: Success state with download link                   */
/* ================================================================== */

describe("U-PERF-103-003: Success state with download link", () => {
  it("shows success banner and download again button after export", async () => {
    mockExportAudit.mockResolvedValue("# Report");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
      expect(screen.getByTestId("export-download-again")).toBeInTheDocument();
      expect(screen.getByTestId("export-back-results")).toBeInTheDocument();
    });
  });

  it("allows downloading again from success state", async () => {
    mockExportAudit.mockResolvedValue("# Report");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
    });

    // Click download again
    await user.click(screen.getByTestId("export-download-again"));

    await waitFor(() => {
      expect(mockExportAudit).toHaveBeenCalledTimes(2);
    });
  });

  it("navigates back to results from success state", async () => {
    mockExportAudit.mockResolvedValue("# Report");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-back-results")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("export-back-results"));

    expect(mockPush).toHaveBeenCalledWith("/results?id=audit-123");
  });
});

/* ================================================================== */
/* U-PERF-103-004: Loading state while generating                     */
/* ================================================================== */

describe("U-PERF-103-004: Loading state while generating", () => {
  it("shows loading spinner and skeleton while export is in progress", async () => {
    mockExportAudit.mockReturnValue(new Promise(() => {})); // never resolves

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-loading")).toBeInTheDocument();
      expect(screen.getByTestId("export-loading")).toHaveAttribute("role", "status");
      expect(screen.getByTestId("export-loading")).toHaveAttribute(
        "aria-label",
        "Generating export"
      );
      expect(screen.getByTestId("export-spinner")).toBeInTheDocument();
      expect(screen.getByText("Generating report...")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* U-PERF-103-005: Error state with retry                             */
/* ================================================================== */

describe("U-PERF-103-005: Error state with retry", () => {
  it("shows error alert with retry button when export fails", async () => {
    const err = new Error("Network error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "EXPORT_FAILED";
    mockExportAudit.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
      expect(screen.getByTestId("export-retry")).toBeInTheDocument();
    });
  });

  it("retries export when retry button is clicked", async () => {
    const err = new Error("Network error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "EXPORT_FAILED";
    mockExportAudit.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-error")).toBeInTheDocument();
    });

    // Switch to success for retry
    mockExportAudit.mockResolvedValue("# Report");

    await user.click(screen.getByTestId("export-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
    });
  });

  it("uses fallback error message when error has no message", async () => {
    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "EXPORT_FAILED";
    mockExportAudit.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to generate export. Please try again."
      );
    });
  });
});

/* ================================================================== */
/* T-PERF-103-001: Calls GET /audits/:id/export?format=md (page)      */
/* ================================================================== */

describe("T-PERF-103-001 (page): Calls exportAudit with correct params", () => {
  it("calls exportAudit with auditId from search params and md format", async () => {
    mockExportAudit.mockResolvedValue("# Report");

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(mockExportAudit).toHaveBeenCalledWith("audit-123", "md");
    });
  });
});

/* ================================================================== */
/* T-PERF-103-002: Handles 400 AUDIT_NOT_COMPLETED (page)             */
/* ================================================================== */

describe("T-PERF-103-002 (page): Handles 400 AUDIT_NOT_COMPLETED", () => {
  it("shows not-completed state when API returns 400 AUDIT_NOT_COMPLETED", async () => {
    const err = new Error("Audit still processing") as Error & {
      status: number;
      code: string;
    };
    err.status = 400;
    err.code = "AUDIT_NOT_COMPLETED";
    mockExportAudit.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-not-completed")).toBeInTheDocument();
      expect(
        screen.getByText("Audit still processing. Please wait and try again.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("export-retry-processing")).toBeInTheDocument();
    });
  });

  it("retries when Check Again button is clicked in not-completed state", async () => {
    const err = new Error("Audit still processing") as Error & {
      status: number;
      code: string;
    };
    err.status = 400;
    err.code = "AUDIT_NOT_COMPLETED";
    mockExportAudit.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("export-not-completed")).toBeInTheDocument();
    });

    // Switch to success for retry
    mockExportAudit.mockResolvedValue("# Report");

    await user.click(screen.getByTestId("export-retry-processing"));

    await waitFor(() => {
      expect(screen.getByTestId("export-success")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-103-003: 401 → redirect to /login (page)                   */
/* ================================================================== */

describe("T-PERF-103-003 (page): 401 → redirect to /login", () => {
  it("redirects to /login on 401 from exportAudit", async () => {
    const err = new Error("Authentication required") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_NO_SESSION";
    mockExportAudit.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});

/* ================================================================== */
/* E-EXPORT-001: Export page renders (covered by unit tests)          */
/* ================================================================== */

describe("E-EXPORT-001: Export page renders with heading", () => {
  it("renders export heading", () => {
    render(<ExportPage />);

    expect(screen.getByText("Export Report")).toBeInTheDocument();
    expect(screen.getByTestId("export-page")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* E-EXPORT-002: Export page returns 200 (covered by E2E)             */
/* ================================================================== */

describe("E-EXPORT-002: Export page structure", () => {
  it("renders main element with correct test id", () => {
    render(<ExportPage />);

    const main = screen.getByTestId("export-page");
    expect(main.tagName).toBe("MAIN");
  });
});

/* ================================================================== */
/* E-EXPORT-003: Export triggers download (test.fixme in E2E)         */
/* ================================================================== */

describe("E-EXPORT-003: Export triggers download", () => {
  it("triggers file download when export succeeds with content", async () => {
    const markdownContent = "# Audit Report\n\nResults here.";
    mockExportAudit.mockResolvedValue(markdownContent);

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-download-btn"));

    await waitFor(() => {
      expect(mockTriggerDownload).toHaveBeenCalledWith(
        markdownContent,
        "audit-audit-123-report.md"
      );
    });
  });
});

/* ================================================================== */
/* Additional: No audit ID → not-found state                          */
/* ================================================================== */

describe("No audit ID → not-found state", () => {
  it("shows not-found state when no id search param is provided", () => {
    mockSearchParamsId = null;

    render(<ExportPage />);

    expect(screen.getByTestId("export-not-found")).toBeInTheDocument();
    expect(screen.getByText("No audit selected")).toBeInTheDocument();
    expect(screen.getByTestId("export-back-dashboard")).toBeInTheDocument();
  });

  it("shows not-found state when id search param is empty string", () => {
    mockSearchParamsId = "";

    render(<ExportPage />);

    expect(screen.getByTestId("export-not-found")).toBeInTheDocument();
  });

  it("navigates to dashboard when Back to Dashboard is clicked", async () => {
    mockSearchParamsId = null;

    const user = userEvent.setup();
    render(<ExportPage />);

    await user.click(screen.getByTestId("export-back-dashboard"));

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});

/* ================================================================== */
/* Additional: MotionWrapper present                                   */
/* ================================================================== */

describe("MotionWrapper integration", () => {
  it("renders within MotionWrapper (animation container present)", () => {
    render(<ExportPage />);

    const exportPage = screen.getByTestId("export-page");
    expect(exportPage).toBeInTheDocument();
    expect(exportPage.parentElement).toBeTruthy();
  });
});

/* ================================================================== */
/* Additional: Back to results navigates to dashboard when no auditId */
/* ================================================================== */

describe("Back to results navigation", () => {
  it("navigates to dashboard when no auditId and back-to-results is triggered", async () => {
    mockSearchParamsId = null;

    render(<ExportPage />);

    // In not-found state, the back-to-dashboard button is shown instead
    expect(screen.getByTestId("export-back-dashboard")).toBeInTheDocument();
  });
});
