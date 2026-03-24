import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "../src/domain/errors.js";
import type { AuditJob } from "../src/domain/audit.js";
import type { PSIResponse } from "../src/lib/psi-client.js";

// --- Mock dependencies ---
const mockGetAuditJob = vi.fn();
const mockUpdateAuditStatus = vi.fn();
const mockUpdateAuditMetrics = vi.fn();
const mockFetchPageSpeedData = vi.fn();

const mockUpdateAuditDesktopMetrics = vi.fn();

vi.mock("../src/adapters/firestore-audit.js", () => ({
  getAuditJob: (...args: unknown[]) => mockGetAuditJob(...args),
  updateAuditStatus: (...args: unknown[]) => mockUpdateAuditStatus(...args),
  updateAuditMetrics: (...args: unknown[]) => mockUpdateAuditMetrics(...args),
  updateAuditDesktopMetrics: (...args: unknown[]) => mockUpdateAuditDesktopMetrics(...args),
}));

vi.mock("../src/lib/psi-client.js", () => ({
  fetchPageSpeedData: (...args: unknown[]) => mockFetchPageSpeedData(...args),
}));

// Use fake timers to make sleep resolve instantly
vi.useFakeTimers();

const { processAuditJob } = await import("../src/services/audit-worker.js");

/** Fixture: a queued audit job. */
const queuedJob: AuditJob = {
  jobId: "job-001",
  uid: "user-123",
  url: "https://example.com",
  status: "queued",
  strategy: "mobile",
  retryCount: 0,
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-18T00:00:00.000Z",
};

/** Fixture: valid PSI response. */
const validPSIResponse: PSIResponse = {
  lighthouseResult: {
    lighthouseVersion: "12.0.0",
    audits: {
      "largest-contentful-paint": { numericValue: 2500 },
      "cumulative-layout-shift": { numericValue: 0.05 },
      "total-blocking-time": { numericValue: 150 },
      "first-contentful-paint": { numericValue: 1200 },
      "server-response-time": { numericValue: 400 },
      "speed-index": { numericValue: 3000 },
    },
    categories: { performance: { score: 0.85 } },
  },
  loadingExperience: {
    metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500 } },
  },
};

/**
 * Helper: run processAuditJob while advancing fake timers so sleep() resolves.
 * We run the job and advance timers concurrently.
 */
async function runWithTimers(jobId: string): Promise<void> {
  const promise = processAuditJob(jobId);

  // Advance timers repeatedly to resolve all sleep() calls
  // Max iterations to prevent infinite loops
  for (let i = 0; i < 20; i++) {
    await vi.advanceTimersByTimeAsync(120_000);
  }

  await promise;
}

/** Fixture: a queued audit job with "both" strategy. */
const bothJob: AuditJob = {
  ...queuedJob,
  strategy: "both",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuditJob.mockResolvedValue(queuedJob);
  mockUpdateAuditStatus.mockResolvedValue(undefined);
  mockUpdateAuditMetrics.mockResolvedValue(undefined);
  mockUpdateAuditDesktopMetrics.mockResolvedValue(undefined);
  mockFetchPageSpeedData.mockResolvedValue(validPSIResponse);
});

// T-ENGINE-008: Worker transitions job through queued → running → completed
describe("T-ENGINE-008: processAuditJob (success flow)", () => {
  it("transitions job from queued → running → completed with metrics stored", async () => {
    await runWithTimers("job-001");

    // Step 1: Read job
    expect(mockGetAuditJob).toHaveBeenCalledWith("job-001");

    // Step 2: Update to running
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "running");

    // Step 3: Call PSI API with correct URL and strategy
    expect(mockFetchPageSpeedData).toHaveBeenCalledWith("https://example.com", "mobile");

    // Step 5: Store metrics
    expect(mockUpdateAuditMetrics).toHaveBeenCalledOnce();
    const metricsArg = mockUpdateAuditMetrics.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(metricsArg["lcp"]).toBe(2500);
    expect(metricsArg["cls"]).toBe(0.05);

    // Step 6: Update to completed
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "completed");
  });
});

// T-ENGINE-007: Successful audit stores metrics in Firestore
describe("T-ENGINE-007: processAuditJob (metrics storage)", () => {
  it("stores all CWV fields in Firestore via updateAuditMetrics", async () => {
    await runWithTimers("job-001");

    expect(mockUpdateAuditMetrics).toHaveBeenCalledWith(
      "job-001",
      expect.objectContaining({
        lcp: 2500,
        cls: 0.05,
        tbt: 150,
        fcp: 1200,
        ttfb: 400,
        si: 3000,
        performanceScore: 0.85,
        lighthouseVersion: "12.0.0",
      })
    );
  });
});

// T-ENGINE-009: Worker handles missing optional metrics (fieldData null)
describe("T-ENGINE-009: processAuditJob (missing fieldData)", () => {
  it("completes successfully when fieldData is null", async () => {
    mockFetchPageSpeedData.mockResolvedValue({
      lighthouseResult: {
        lighthouseVersion: "12.0.0",
        audits: {
          "largest-contentful-paint": { numericValue: 2500 },
          "cumulative-layout-shift": { numericValue: 0.05 },
          "total-blocking-time": { numericValue: 150 },
          "first-contentful-paint": { numericValue: 1200 },
          "server-response-time": { numericValue: 400 },
          "speed-index": { numericValue: 3000 },
        },
        categories: { performance: { score: 0.9 } },
      },
    });

    await runWithTimers("job-001");

    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "completed");
    const metricsArg = mockUpdateAuditMetrics.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(metricsArg["fieldData"]).toBeNull();
  });
});

// T-ENGINE-002: PSI API returns 400 for invalid URL — fail immediately, no retry
describe("T-ENGINE-002: processAuditJob (invalid URL — no retry)", () => {
  it("fails immediately without retry for non-retryable errors", async () => {
    mockFetchPageSpeedData.mockRejectedValue(
      new AppError(400, "PSI_INVALID_URL", "Invalid URL: bad url")
    );

    await runWithTimers("job-001");

    // Should set to running, then fail — no retrying state
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "running");
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "failed", {
      lastError: "Invalid URL: bad url",
      retryCount: 0,
    });

    // PSI API called only once (no retry)
    expect(mockFetchPageSpeedData).toHaveBeenCalledOnce();
  });
});

// P-ENGINE-002: User submits unreachable URL — clear error, job marked failed
describe("P-ENGINE-002: processAuditJob (unreachable URL)", () => {
  it("fails with clear error message for runtime error", async () => {
    mockFetchPageSpeedData.mockRejectedValue(
      new AppError(400, "PSI_RUNTIME_ERROR", "Lighthouse error: Could not load the page")
    );

    await runWithTimers("job-001");

    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "failed", {
      lastError: "Lighthouse error: Could not load the page",
      retryCount: 0,
    });
  });
});

// T-ENGINE-003: PSI API times out — retry with exponential backoff, max 3 attempts
describe("T-ENGINE-003: processAuditJob (timeout — retry)", () => {
  it("retries up to 3 times on timeout, then fails", async () => {
    mockFetchPageSpeedData.mockRejectedValue(
      new AppError(504, "PSI_TIMEOUT", "PSI API request timed out after 30 seconds.")
    );

    await runWithTimers("job-001");

    // 4 total attempts (0, 1, 2, 3)
    expect(mockFetchPageSpeedData).toHaveBeenCalledTimes(4);

    // Should transition through retrying states
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith(
      "job-001",
      "retrying",
      expect.objectContaining({
        retryCount: 1,
      })
    );
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith(
      "job-001",
      "retrying",
      expect.objectContaining({
        retryCount: 2,
      })
    );
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith(
      "job-001",
      "retrying",
      expect.objectContaining({
        retryCount: 3,
      })
    );

    // Final failure
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith(
      "job-001",
      "failed",
      expect.objectContaining({
        retryCount: 3,
      })
    );
  });
});

// T-ENGINE-004: PSI API returns 429 rate limit — retry
describe("T-ENGINE-004: processAuditJob (rate limit — retry)", () => {
  it("retries on rate limit with Retry-After delay", async () => {
    // First call: rate limited. Second call: success.
    mockFetchPageSpeedData
      .mockRejectedValueOnce(
        new AppError(429, "PSI_RATE_LIMITED", "Rate limited", { retryAfter: 60 })
      )
      .mockResolvedValueOnce(validPSIResponse);

    await runWithTimers("job-001");

    expect(mockFetchPageSpeedData).toHaveBeenCalledTimes(2);
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith(
      "job-001",
      "retrying",
      expect.objectContaining({
        retryCount: 1,
      })
    );
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "completed");
  });
});

// T-ENGINE-005: PSI API returns 500 server error — retry
describe("T-ENGINE-005: processAuditJob (server error — retry)", () => {
  it("retries on server error with exponential backoff", async () => {
    // First two calls: server error. Third call: success.
    mockFetchPageSpeedData
      .mockRejectedValueOnce(new AppError(502, "PSI_SERVER_ERROR", "PSI API server error"))
      .mockRejectedValueOnce(new AppError(502, "PSI_SERVER_ERROR", "PSI API server error"))
      .mockResolvedValueOnce(validPSIResponse);

    await runWithTimers("job-001");

    expect(mockFetchPageSpeedData).toHaveBeenCalledTimes(3);
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "completed");
  });
});

// T-ENGINE-006: Max retries exceeded — job status set to "failed"
describe("T-ENGINE-006: processAuditJob (max retries exceeded)", () => {
  it("sets job to failed with lastError after max retries", async () => {
    mockFetchPageSpeedData.mockRejectedValue(
      new AppError(502, "PSI_NETWORK_ERROR", "Network error calling PSI API")
    );

    await runWithTimers("job-001");

    // 4 total attempts (initial + 3 retries)
    expect(mockFetchPageSpeedData).toHaveBeenCalledTimes(4);

    // Final status is failed with max retries message
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "failed", {
      lastError: "Max retries exceeded: Network error calling PSI API",
      retryCount: 3,
    });
  });
});

// Edge cases
describe("processAuditJob (edge cases)", () => {
  it("returns early when job is not found", async () => {
    mockGetAuditJob.mockResolvedValue(null);

    await runWithTimers("nonexistent");

    expect(mockUpdateAuditStatus).not.toHaveBeenCalled();
    expect(mockFetchPageSpeedData).not.toHaveBeenCalled();
  });

  it("returns early when job is not in queued state", async () => {
    mockGetAuditJob.mockResolvedValue({ ...queuedJob, status: "running" });

    await runWithTimers("job-001");

    expect(mockUpdateAuditStatus).not.toHaveBeenCalled();
    expect(mockFetchPageSpeedData).not.toHaveBeenCalled();
  });

  it("returns early when job is already completed", async () => {
    mockGetAuditJob.mockResolvedValue({ ...queuedJob, status: "completed" });

    await runWithTimers("job-001");

    expect(mockUpdateAuditStatus).not.toHaveBeenCalled();
  });

  it("wraps non-AppError Error exceptions and fails immediately", async () => {
    mockFetchPageSpeedData.mockRejectedValue(new Error("Unexpected crash"));

    await runWithTimers("job-001");

    // Non-retryable unknown error — fails immediately
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "failed", {
      lastError: "Unexpected crash",
      retryCount: 0,
    });
  });

  it("wraps non-Error thrown values with 'Unknown error' message", async () => {
    mockFetchPageSpeedData.mockRejectedValue("string-error-not-an-Error-instance");

    await runWithTimers("job-001");

    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "failed", {
      lastError: "Unknown error during audit processing",
      retryCount: 0,
    });
  });
});

// P-ENGINE-001: User submits URL and audit completes with real CWV data
describe("P-ENGINE-001: processAuditJob (full success — metrics visible)", () => {
  it("completes audit with all metrics stored and status completed", async () => {
    await runWithTimers("job-001");

    // Metrics stored
    expect(mockUpdateAuditMetrics).toHaveBeenCalledOnce();
    const metrics = mockUpdateAuditMetrics.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(metrics["lcp"]).toBe(2500);
    expect(metrics["performanceScore"]).toBe(0.85);
    expect(metrics["fieldData"]).toBeDefined();

    // Status completed
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "completed");
  });
});

// PERF-155: "both" strategy runs mobile + desktop PSI calls
describe("PERF-155: processAuditJob (both strategy)", () => {
  it("runs mobile then desktop PSI calls and stores both metrics", async () => {
    mockGetAuditJob.mockResolvedValue(bothJob);

    await runWithTimers("job-001");

    // Two PSI calls: mobile first, then desktop
    expect(mockFetchPageSpeedData).toHaveBeenCalledTimes(2);
    expect(mockFetchPageSpeedData).toHaveBeenNthCalledWith(1, "https://example.com", "mobile");
    expect(mockFetchPageSpeedData).toHaveBeenNthCalledWith(2, "https://example.com", "desktop");

    // Mobile metrics stored via updateAuditMetrics
    expect(mockUpdateAuditMetrics).toHaveBeenCalledOnce();

    // Desktop metrics stored via updateAuditDesktopMetrics
    expect(mockUpdateAuditDesktopMetrics).toHaveBeenCalledOnce();

    // Status completed
    expect(mockUpdateAuditStatus).toHaveBeenCalledWith("job-001", "completed");
  });
});
