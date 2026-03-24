import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockPush = vi.fn();
let mockSearchParamsUrl: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === "url" ? mockSearchParamsUrl : null),
  }),
}));

const mockCreateAudit = vi.fn();
const mockGetAuditStatus = vi.fn();
const mockGetRecentAudits = vi.fn();
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAudit: (...args: unknown[]) => mockCreateAudit(...args),
    getAuditStatus: (...args: unknown[]) => mockGetAuditStatus(...args),
    getRecentAudits: (...args: unknown[]) => mockGetRecentAudits(...args),
  };
});

// Import after mocks
import AuditPage from "../../app/(authenticated)/audit/page";
import type { RecentAuditItem } from "../../lib/audit";

/** Helper: wrap items in paginated response shape. */
function recentResponse(items: RecentAuditItem[], total?: number) {
  return { items, page: 1, size: 5, total: total ?? items.length };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Default: recent audits returns empty list with pagination
  mockGetRecentAudits.mockResolvedValue({ items: [], page: 1, size: 5, total: 0 });
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
      expect(mockCreateAudit).toHaveBeenCalledWith("https://example.com", "mobile");
      expect(screen.getByTestId("audit-progress")).toBeInTheDocument();
      // PERF-142: spinner is now inside AuditProgress stepper
      expect(screen.getByTestId("audit-progress-stepper")).toBeInTheDocument();
      expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
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
  it("shows progress stepper with first step active initially", async () => {
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
      // PERF-142: status is now shown in the progress stepper live region
      expect(screen.getByTestId("audit-progress-stepper")).toBeInTheDocument();
      expect(screen.getByTestId("step-label-0")).toHaveTextContent("Fetching your page...");
    });
  });

  it("shows progress stepper with step advancing after poll", async () => {
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

    // Advance past step timer (4s) to trigger step advance
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    await waitFor(() => {
      // PERF-142: step should have advanced, live region shows current step
      expect(screen.getByTestId("audit-progress-stepper")).toBeInTheDocument();
      expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
    });
  });

  it("shows progress stepper during retrying status", async () => {
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
      // PERF-142: retrying is non-terminal, progress stepper stays visible
      expect(screen.getByTestId("audit-progress-stepper")).toBeInTheDocument();
      expect(screen.getByTestId("step-spinner")).toBeInTheDocument();
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

  it("has accessible progress indicator with role=progressbar", async () => {
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
      // PERF-142: progress stepper uses role="progressbar" with aria-valuenow
      const stepper = screen.getByTestId("audit-progress-stepper");
      expect(stepper).toHaveAttribute("role", "progressbar");
      expect(stepper).toHaveAttribute("aria-label", "Audit progress");
      expect(stepper).toHaveAttribute("aria-valuenow");
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
      expect(mockCreateAudit).toHaveBeenCalledWith("https://example.com", "mobile");
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
  it("shows error in progress stepper and retry button when audit fails", async () => {
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
      // PERF-142: error now shown in progress stepper with error icon + message
      expect(screen.getByTestId("audit-error-progress")).toBeInTheDocument();
      expect(screen.getByTestId("step-error-icon")).toBeInTheDocument();
      expect(screen.getByTestId("audit-progress-error")).toHaveTextContent("TIMEOUT");
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
  it("shows error in progress stepper when audit is cancelled", async () => {
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
      // PERF-142: cancelled shows error in progress stepper
      expect(screen.getByTestId("audit-error-progress")).toBeInTheDocument();
      expect(screen.getByTestId("step-error-icon")).toBeInTheDocument();
      expect(screen.getByTestId("audit-progress-error")).toBeInTheDocument();
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

  it("returns empty string for unknown/cancelled status (fallback branch)", async () => {
    const { getStatusMessage } = await import("../../lib/audit");
    expect(getStatusMessage("cancelled")).toBe("");
  });
});

/* ================================================================== */
/* PERF-142: Step timer caps at step 3 (does not advance past)        */
/* ================================================================== */

describe("PERF-142: Step timer caps at penultimate step", () => {
  it("step timer does not advance past step 3 (step 4 reserved for completed)", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-cap",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
    // Keep running — never completes
    mockGetAuditStatus.mockResolvedValue({
      jobId: "job-cap",
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

    // Advance 5 step intervals (5 * 4s = 20s) — should cap at step 3
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
    }

    await waitFor(() => {
      // Step 3 (0-indexed) = "Analyzing results with AI..." should be active
      // Steps 0-2 completed, step 3 active, step 4 still pending
      const liveRegion = screen.getByTestId("audit-progress-live");
      expect(liveRegion).toHaveTextContent("Step 4 of 5: Analyzing results with AI...");
    });
  });
});

/* ================================================================== */
/* PERF-155: Engine Settings — strategy toggle                         */
/* ================================================================== */

describe("PERF-155: Engine Settings strategy dropdown", () => {
  it("renders engine settings panel", () => {
    render(<AuditPage />);
    expect(screen.getByTestId("engine-settings")).toBeInTheDocument();
    expect(screen.getByText("Engine Settings")).toBeInTheDocument();
  });

  it("renders strategy dropdown trigger with default Mobile Emulation", () => {
    render(<AuditPage />);
    const trigger = screen.getByTestId("strategy-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Mobile Emulation")).toBeInTheDocument();
  });

  it("opens dropdown options when trigger is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    expect(screen.queryByTestId("strategy-options")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("strategy-trigger"));

    expect(screen.getByTestId("strategy-options")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-trigger")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("strategy-option-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-option-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-option-both")).toBeInTheDocument();
  });

  it("selects Desktop and closes dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await user.click(screen.getByTestId("strategy-trigger"));
    await user.click(screen.getByTestId("strategy-option-desktop"));

    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.queryByTestId("strategy-options")).not.toBeInTheDocument();
  });

  it("selects Both and closes dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await user.click(screen.getByTestId("strategy-trigger"));
    await user.click(screen.getByTestId("strategy-option-both"));

    expect(screen.getByText("Both (Mobile + Desktop)")).toBeInTheDocument();
    expect(screen.queryByTestId("strategy-options")).not.toBeInTheDocument();
  });

  it("toggles dropdown closed when trigger is clicked again", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await user.click(screen.getByTestId("strategy-trigger"));
    expect(screen.getByTestId("strategy-options")).toBeInTheDocument();

    await user.click(screen.getByTestId("strategy-trigger"));
    expect(screen.queryByTestId("strategy-options")).not.toBeInTheDocument();
  });

  it("marks current selection with aria-selected and green dot", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await user.click(screen.getByTestId("strategy-trigger"));

    expect(screen.getByTestId("strategy-option-mobile")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("strategy-option-desktop")).toHaveAttribute("aria-selected", "false");
  });

  it("sends selected strategy with audit submission", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-strat",
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    // Select desktop via dropdown
    await user.click(screen.getByTestId("strategy-trigger"));
    await user.click(screen.getByTestId("strategy-option-desktop"));

    // Fill URL and submit
    const input = screen.getByTestId("audit-url-input");
    await user.clear(input);
    await user.type(input, "https://example.com");
    await user.click(screen.getByTestId("audit-submit"));

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalledWith("https://example.com", "desktop");
    });
  });

  it("sends mobile strategy by default with audit submission", async () => {
    mockCreateAudit.mockResolvedValue({
      jobId: "job-default",
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    const input = screen.getByTestId("audit-url-input");
    await user.clear(input);
    await user.type(input, "https://example.com");
    await user.click(screen.getByTestId("audit-submit"));

    await waitFor(() => {
      expect(mockCreateAudit).toHaveBeenCalledWith("https://example.com", "mobile");
    });
  });

  it("shows Engine Ready status indicator", () => {
    render(<AuditPage />);
    expect(screen.getByText("Engine Ready")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* PERF-155: Recent audits section                                     */
/* ================================================================== */

describe("PERF-155: Recent audits section", () => {
  it("shows loading skeleton while fetching recent audits", () => {
    mockGetRecentAudits.mockReturnValue(new Promise(() => {}));
    render(<AuditPage />);
    expect(screen.getByTestId("recent-loading")).toBeInTheDocument();
  });

  it("shows empty state when no recent audits exist", async () => {
    mockGetRecentAudits.mockResolvedValue(recentResponse([]));
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-empty")).toBeInTheDocument();
      expect(
        screen.getByText("No audits yet. Enter a URL above to get started.")
      ).toBeInTheDocument();
    });
  });

  it("renders recent audit rows with URL and Score label", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-recent-1",
          url: "https://example.com/page",
          status: "completed",
          performanceScore: 0.98,
          createdAt: new Date(Date.now() - 7_200_000).toISOString(),
          completedAt: new Date(Date.now() - 7_100_000).toISOString(),
        },
        {
          jobId: "job-recent-2",
          url: "https://other.com",
          status: "failed",
          performanceScore: null,
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-recent-1")).toBeInTheDocument();
      expect(screen.getByTestId("recent-audit-job-recent-2")).toBeInTheDocument();
    });
    expect(screen.getByText("example.com/page")).toBeInTheDocument();
    expect(screen.getByText("other.com")).toBeInTheDocument();
    expect(screen.getByText("Score 98")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("navigates to results when clicking a completed audit", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-click",
          url: "https://example.com",
          status: "completed",
          performanceScore: 0.85,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ])
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-click")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("recent-audit-job-click"));
    expect(mockPush).toHaveBeenCalledWith("/results?id=job-click");
  });

  it("shows in-progress label for queued/running audits", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-running",
          url: "https://running.com",
          status: "running",
          performanceScore: null,
          createdAt: new Date().toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText("In progress")).toBeInTheDocument();
    });
  });

  it("silently handles fetch error for recent audits", async () => {
    mockGetRecentAudits.mockRejectedValue(new Error("Network error"));
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-empty")).toBeInTheDocument();
    });
  });

  it("navigates to results via keyboard Enter on completed audit", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-kb",
          url: "https://kb.com",
          status: "completed",
          performanceScore: 0.92,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-kb")).toBeInTheDocument();
    });
    fireEvent.keyDown(screen.getByTestId("recent-audit-job-kb"), { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/results?id=job-kb");
  });

  it("navigates to results via keyboard Space on completed audit", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-sp",
          url: "https://sp.com",
          status: "completed",
          performanceScore: 0.75,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-sp")).toBeInTheDocument();
    });
    fireEvent.keyDown(screen.getByTestId("recent-audit-job-sp"), { key: " " });
    expect(mockPush).toHaveBeenCalledWith("/results?id=job-sp");
  });

  it("does not navigate on keyboard for non-completed audit", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-nc",
          url: "https://nc.com",
          status: "running",
          performanceScore: null,
          createdAt: new Date().toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-nc")).toBeInTheDocument();
    });
    fireEvent.keyDown(screen.getByTestId("recent-audit-job-nc"), { key: "Enter" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("renders 'Just now' for very recent audits", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-now",
          url: "https://now.com",
          status: "completed",
          performanceScore: 0.99,
          createdAt: new Date(Date.now() - 10_000).toISOString(),
          completedAt: new Date(Date.now() - 5_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText(/Just now/)).toBeInTheDocument();
    });
  });

  it("renders 'X min ago' for audits from minutes ago", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-min",
          url: "https://min.com",
          status: "completed",
          performanceScore: 0.88,
          createdAt: new Date(Date.now() - 15 * 60_000).toISOString(),
          completedAt: new Date(Date.now() - 14 * 60_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText(/15 min ago/)).toBeInTheDocument();
    });
  });

  it("renders 'X hours ago' for audits from hours ago", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-hr",
          url: "https://hr.com",
          status: "completed",
          performanceScore: 0.76,
          createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
          completedAt: new Date(Date.now() - 3 * 3_600_000 + 60_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 hours ago/)).toBeInTheDocument();
    });
  });

  it("renders '1 hour ago' (singular) for audits from 1 hour ago", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-1hr",
          url: "https://onehr.com",
          status: "completed",
          performanceScore: 0.91,
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
          completedAt: new Date(Date.now() - 3_500_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 hour ago/)).toBeInTheDocument();
    });
  });

  it("renders 'Yesterday' for audits from 1 day ago", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-yday",
          url: "https://yesterday.com",
          status: "completed",
          performanceScore: 0.64,
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
          completedAt: new Date(Date.now() - 86_300_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText(/Yesterday/)).toBeInTheDocument();
    });
  });

  it("renders 'X days ago' for audits older than 1 day", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-old",
          url: "https://old.com",
          status: "completed",
          performanceScore: 0.45,
          createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          completedAt: new Date(Date.now() - 3 * 86_400_000 + 60_000).toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 days ago/)).toBeInTheDocument();
    });
  });

  it("does not navigate on click for non-completed audit", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-fail-click",
          url: "https://fail.com",
          status: "failed",
          performanceScore: null,
          createdAt: new Date().toISOString(),
        },
      ])
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-fail-click")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("recent-audit-job-fail-click"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows 'Load more' button when more items exist", async () => {
    mockGetRecentAudits.mockResolvedValue({
      items: [
        {
          jobId: "job-1",
          url: "https://a.com",
          status: "completed",
          performanceScore: 0.9,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      page: 1,
      size: 5,
      total: 8,
    });
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-load-more")).toBeInTheDocument();
    });
    expect(screen.getByTestId("recent-load-more")).toHaveTextContent("Load more");
  });

  it("does not show 'Load more' when all items are loaded", async () => {
    mockGetRecentAudits.mockResolvedValue(
      recentResponse([
        {
          jobId: "job-1",
          url: "https://a.com",
          status: "completed",
          performanceScore: 0.9,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ])
    );
    render(<AuditPage />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-1")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("recent-load-more")).not.toBeInTheDocument();
  });

  it("loads more items when 'Load more' is clicked", async () => {
    // First call: page 1 with 1 item, total 2
    mockGetRecentAudits.mockResolvedValueOnce({
      items: [
        {
          jobId: "job-p1",
          url: "https://p1.com",
          status: "completed",
          performanceScore: 0.8,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      page: 1,
      size: 5,
      total: 2,
    });
    // Second call: page 2 with 1 more item
    mockGetRecentAudits.mockResolvedValueOnce({
      items: [
        {
          jobId: "job-p2",
          url: "https://p2.com",
          status: "completed",
          performanceScore: 0.7,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      page: 2,
      size: 5,
      total: 2,
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByTestId("recent-load-more")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("recent-load-more"));

    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-p1")).toBeInTheDocument();
      expect(screen.getByTestId("recent-audit-job-p2")).toBeInTheDocument();
    });
    // Second call should be page 2
    expect(mockGetRecentAudits).toHaveBeenCalledWith(2, 5);
  });

  it("silently handles error when loading more", async () => {
    mockGetRecentAudits.mockResolvedValueOnce({
      items: [
        {
          jobId: "job-err",
          url: "https://err.com",
          status: "completed",
          performanceScore: 0.5,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      page: 1,
      size: 5,
      total: 10,
    });
    // Second call fails
    mockGetRecentAudits.mockRejectedValueOnce(new Error("Network error"));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByTestId("recent-load-more")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("recent-load-more"));

    // Should not crash — original items still visible
    await waitFor(() => {
      expect(screen.getByTestId("recent-audit-job-err")).toBeInTheDocument();
    });
  });
});
