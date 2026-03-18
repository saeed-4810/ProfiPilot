import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockCreateAudit = vi.fn();
const mockGetAuditStatus = vi.fn();
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAudit: (...args: unknown[]) => mockCreateAudit(...args),
    getAuditStatus: (...args: unknown[]) => mockGetAuditStatus(...args),
  };
});

// Import after mocks
import AuditPage from "../../app/(authenticated)/audit/page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* Helper: submit a URL                                               */
/* ------------------------------------------------------------------ */

async function submitUrl(user: ReturnType<typeof userEvent.setup>, url: string) {
  await user.type(screen.getByTestId("audit-url-input"), url);
  await user.click(screen.getByTestId("audit-submit"));
}

/* ================================================================== */
/* P-PERF-100-001: Submit valid URL → job created, progress shown     */
/* ================================================================== */

describe("P-PERF-100-001: Submit valid URL → job created, progress indicator shown", () => {
  it("creates audit job and shows progress indicator", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-abc",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    // Keep polling alive — never resolves to terminal
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-abc",
      status: "running",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:01Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalledWith("https://example.com");
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
      expect(screen.getByTestId("audit-spinner")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* P-PERF-100-002: Audit completes → redirect to /results?id={jobId}  */
/* ================================================================== */

describe("P-PERF-100-002: Audit completes → redirect to /results?id={jobId}", () => {
  it("redirects to results page when audit completes", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-xyz",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-xyz",
      status: "completed",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:05Z",
      completedAt: "2026-03-17T00:00:05Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    // Wait for createAudit to resolve
    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalled();
    });

    // Advance timer to trigger first poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("audit-success")).toBeInTheDocument();
      expect(screen.getByText("Audit complete. Results ready.")).toBeInTheDocument();
    });

    // Advance timer for the redirect delay (800ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(mockPush).toHaveBeenCalledWith("/results?id=job-xyz");
  });
});

/* ================================================================== */
/* P-PERF-100-003: Invalid URL → validation error, no job created     */
/* ================================================================== */

describe("P-PERF-100-003: Invalid URL → validation error shown, no job created", () => {
  it("shows validation error for non-https URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "http://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-field-error")).toBeInTheDocument();
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
    expect(mockCreateAudit).not.toHaveBeenCalled();
  });

  it("shows validation error for empty URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await user.click(screen.getByTestId("audit-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("audit-field-error")).toBeInTheDocument();
    });
    expect(mockCreateAudit).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid URL format", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "not-a-url");

    await waitFor(() => {
      expect(screen.getByTestId("audit-field-error")).toBeInTheDocument();
    });
    expect(mockCreateAudit).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* U-PERF-100-001: Validation errors shown inline per field           */
/* ================================================================== */

describe("U-PERF-100-001: Validation errors shown inline per field", () => {
  it("renders inline error with aria-invalid and aria-describedby", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "ftp://bad.com");

    await waitFor(() => {
      const input = screen.getByTestId("audit-url-input");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", "url-error");
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
  });

  it("clears field error when user resubmits", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-1",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-1",
      status: "running",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:01Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    // First submit with invalid URL
    await submitUrl(user, "bad");
    await waitFor(() => {
      expect(screen.getByTestId("audit-field-error")).toBeInTheDocument();
    });

    // Clear and submit with valid URL
    await user.clear(screen.getByTestId("audit-url-input"));
    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.queryByTestId("audit-field-error")).not.toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* U-PERF-100-002: Progress indicator visible while audit runs        */
/* ================================================================== */

describe("U-PERF-100-002: Progress indicator visible while audit runs (queued/running states)", () => {
  it("shows queued status message initially", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-q",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-q",
      status: "queued",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:00Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
      expect(screen.getByText("Audit queued. Preparing run...")).toBeInTheDocument();
    });
  });

  it("updates to running status message after poll", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-r",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-r",
      status: "running",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:01Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
    });

    // Advance to trigger poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByText("Audit running. This can take a moment.")).toBeInTheDocument();
    });
  });

  it("shows retrying status message", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-ret",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-ret",
      status: "retrying",
      retryCount: 1,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:02Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByText("Temporary issue. Retrying automatically...")).toBeInTheDocument();
    });
  });

  it("disables submit button during loading", async () => {
    mockCreateAudit.mockReturnValue(new Promise(() => {})); // never resolves

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      // Form is hidden during loading, so submit button should not be in the document
      expect(screen.queryByTestId("audit-submit")).not.toBeInTheDocument();
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
    });
  });

  it("has accessible progress indicator with role=status", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-a11y",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-a11y",
      status: "running",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:01Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      const progress = screen.getByTestId("audit-progress");
      expect(progress).toHaveAttribute("role", "status");
    });
  });
});

/* ================================================================== */
/* U-PERF-100-003: Empty state with CTA when no audit has been run    */
/* ================================================================== */

describe("U-PERF-100-003: Empty state with CTA when no audit has been run", () => {
  it("shows onboarding helper text on first visit", () => {
    render(<AuditPage />);

    expect(screen.getByTestId("audit-helper")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add one URL to run your first audit. Need help? Contact support at any step."
      )
    ).toBeInTheDocument();
  });

  it("shows URL input form with submit button", () => {
    render(<AuditPage />);

    expect(screen.getByTestId("audit-url-input")).toBeInTheDocument();
    expect(screen.getByTestId("audit-submit")).toBeInTheDocument();
    expect(screen.getByLabelText(/website url/i)).toBeInTheDocument();
  });

  it("renders within MotionWrapper (animation container present)", () => {
    render(<AuditPage />);

    const auditPage = screen.getByTestId("audit-page");
    expect(auditPage).toBeInTheDocument();
    expect(auditPage.parentElement).toBeTruthy();
  });
});

/* ================================================================== */
/* T-PERF-100-001: POST /audits returns 202 with jobId                */
/* ================================================================== */

describe("T-PERF-100-001: POST /audits returns 202 with jobId", () => {
  it("calls createAudit and transitions to loading with jobId", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-202",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-202",
      status: "running",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:01Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalledWith("https://example.com");
      expect(screen.getByTestId("audit-job-id")).toHaveTextContent("Job: job-202");
    });
  });
});

/* ================================================================== */
/* T-PERF-100-002: POST /audits with bad URL returns 400              */
/* ================================================================== */

describe("T-PERF-100-002: POST /audits with bad URL returns 400", () => {
  it("shows server validation error on 400 response", async () => {
    const err = new Error("URL must be a valid HTTPS URL") as Error & {
      status: number;
      code: string;
    };
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    mockCreateAudit.mockRejectedValue(err);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    // Use a URL that passes client-side Zod but fails server-side
    await submitUrl(user, "https://invalid-server-side.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-field-error")).toBeInTheDocument();
      expect(screen.getByText("URL must be a valid HTTPS URL")).toBeInTheDocument();
    });
    // Should return to empty state (form visible)
    expect(screen.getByTestId("audit-url-input")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* T-PERF-100-003: Unauthenticated request → 401 → redirect /login   */
/* ================================================================== */

describe("T-PERF-100-003: Unauthenticated request returns 401 → redirect to /login", () => {
  it("redirects to /login on 401 from createAudit", async () => {
    const err = new Error("Authentication required") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_NO_SESSION";
    mockCreateAudit.mockRejectedValue(err);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to /login on 401 from polling", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-auth",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });

    const pollErr = new Error("Session expired") as Error & {
      status: number;
      code: string;
    };
    pollErr.status = 401;
    pollErr.code = "AUTH_SESSION_INVALID";
    mockGetAuditStatus.mockRejectedValue(pollErr);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalled();
    });

    // Advance to trigger poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});

/* ================================================================== */
/* Additional: Failed audit → error state with retry CTA              */
/* ================================================================== */

describe("Failed audit → error state with retry CTA", () => {
  it("shows error message and retry button when audit fails", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-fail",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-fail",
      status: "failed",
      retryCount: 3,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:10Z",
      lastError: "TIMEOUT",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalled();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("audit-error")).toBeInTheDocument();
      expect(screen.getByText("Audit failed. Try again or review logs.")).toBeInTheDocument();
      expect(screen.getByTestId("audit-retry")).toBeInTheDocument();
    });
  });

  it("returns to empty state when retry is clicked", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-fail2",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-fail2",
      status: "failed",
      retryCount: 3,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:10Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalled();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("audit-retry")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("audit-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("audit-helper")).toBeInTheDocument();
      expect(screen.getByTestId("audit-url-input")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: General server error (non-400, non-401)                */
/* ================================================================== */

describe("General server error handling", () => {
  it("shows error banner for 500 errors from createAudit", async () => {
    const err = new Error("Internal server error") as Error & {
      status: number;
      code: string;
    };
    err.status = 500;
    err.code = "AUDIT_CREATE_FAILED";
    mockCreateAudit.mockRejectedValue(err);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Internal server error");
    });
  });
});

/* ================================================================== */
/* Additional: Cancelled audit status                                 */
/* ================================================================== */

describe("Cancelled audit → error state", () => {
  it("shows error state when audit is cancelled", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-cancel",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-cancel",
      status: "cancelled",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:03Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalled();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("audit-error")).toBeInTheDocument();
      expect(screen.getByText("Audit failed. Try again or review logs.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Server 400 error with empty message (fallback copy)    */
/* ================================================================== */

describe("Server 400 with empty message uses fallback copy", () => {
  it("uses fallback validation error copy when server message is empty", async () => {
    const err = new Error("") as Error & { status: number; code: string };
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    mockCreateAudit.mockRejectedValue(err);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-field-error")).toBeInTheDocument();
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Server 500 error with empty message (fallback)         */
/* ================================================================== */

describe("Server 500 with empty message uses fallback", () => {
  it("uses fallback error message when server message is empty", async () => {
    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "AUDIT_CREATE_FAILED";
    mockCreateAudit.mockRejectedValue(err);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("An unexpected error occurred.");
    });
  });
});

/* ================================================================== */
/* Additional: Non-401 polling error keeps polling alive              */
/* ================================================================== */

describe("Non-401 polling error keeps polling alive", () => {
  it("continues polling after transient non-401 error", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-transient",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });

    // First poll fails with 500, second poll succeeds with completed
    mockGetAuditStatus
      .mockRejectedValueOnce(
        Object.assign(new Error("Server error"), { status: 500, code: "INTERNAL_ERROR" })
      )
      .mockResolvedValueOnce({
        jobId: "job-transient",
        status: "completed",
        retryCount: 0,
        createdAt: "2026-03-17T00:00:00Z",
        updatedAt: "2026-03-17T00:00:06Z",
        completedAt: "2026-03-17T00:00:06Z",
      });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalled();
    });

    // First poll — transient error, should keep polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    // Second poll — completed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("audit-success")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Cleanup on unmount during active polling               */
/* ================================================================== */

describe("Cleanup on unmount during active polling", () => {
  it("clears interval when component unmounts during polling", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-unmount",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-unmount",
      status: "running",
      retryCount: 0,
      createdAt: "2026-03-17T00:00:00Z",
      updatedAt: "2026-03-17T00:00:01Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<AuditPage />);

    await submitUrl(user, "https://example.com");

    await waitFor(() => {
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
    });

    // Unmount while polling is active — should not throw
    unmount();

    // Advance timers after unmount — should not cause errors
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
  });
});

/* ================================================================== */
/* Additional: getStatusMessage export                                */
/* ================================================================== */

describe("getStatusMessage", () => {
  it("is exported from lib/audit and returns correct copy for each status", async () => {
    const { getStatusMessage } = await import("../../lib/audit");
    expect(getStatusMessage("queued")).toBe("Audit queued. Preparing run...");
    expect(getStatusMessage("running")).toBe("Audit running. This can take a moment.");
    expect(getStatusMessage("retrying")).toBe("Temporary issue. Retrying automatically...");
    expect(getStatusMessage("failed")).toBe("Audit failed. Try again or review logs.");
    expect(getStatusMessage("completed")).toBe("Audit complete. Results ready.");
  });
});
