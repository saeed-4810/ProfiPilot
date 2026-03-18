import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "../src/domain/errors.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { fetchPageSpeedData } = await import("../src/lib/psi-client.js");

beforeEach(() => {
  vi.clearAllMocks();
  process.env["PAGESPEED_API_KEY"] = "test-api-key";
});

afterEach(() => {
  delete process.env["PAGESPEED_API_KEY"];
});

/** Helper to create a mock Response object. */
function mockResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  } as Response;
}

// T-ENGINE-001: PSI API returns valid response for public URL
describe("T-ENGINE-001: fetchPageSpeedData (success)", () => {
  it("returns parsed PSI response for a valid URL", async () => {
    const psiBody = {
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

    mockFetch.mockResolvedValue(mockResponse(200, psiBody));

    const result = await fetchPageSpeedData("https://example.com", "mobile");

    expect(result.lighthouseResult?.lighthouseVersion).toBe("12.0.0");
    expect(result.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue).toBe(2500);
    expect(result.lighthouseResult?.categories?.performance?.score).toBe(0.85);
    expect(result.loadingExperience?.metrics).toBeDefined();

    // Verify correct URL construction
    const callUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("url=https%3A%2F%2Fexample.com");
    expect(callUrl).toContain("category=performance");
    expect(callUrl).toContain("strategy=mobile");
    expect(callUrl).toContain("key=test-api-key");
  });

  it("works without API key", async () => {
    delete process.env["PAGESPEED_API_KEY"];

    mockFetch.mockResolvedValue(mockResponse(200, { lighthouseResult: {} }));

    await fetchPageSpeedData("https://example.com", "desktop");

    const callUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(callUrl).not.toContain("key=");
    expect(callUrl).toContain("strategy=desktop");
  });
});

// T-ENGINE-002: PSI API returns 400 for invalid URL
describe("T-ENGINE-002: fetchPageSpeedData (invalid URL — 400)", () => {
  it("throws AppError with PSI_INVALID_URL for 400 response", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(400, {
        error: { code: 400, message: "Invalid value for URL", errors: [{ reason: "invalid" }] },
      })
    );

    await expect(fetchPageSpeedData("https://not-a-real-site.invalid", "mobile")).rejects.toThrow(
      AppError
    );

    try {
      await fetchPageSpeedData("https://not-a-real-site.invalid", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(400);
      expect(appError.envelope.code).toBe("PSI_INVALID_URL");
    }
  });
});

// T-ENGINE-003: PSI API times out (30s)
describe("T-ENGINE-003: fetchPageSpeedData (timeout)", () => {
  it("throws AppError with PSI_TIMEOUT when request is aborted", async () => {
    mockFetch.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    await expect(fetchPageSpeedData("https://example.com", "mobile")).rejects.toThrow(AppError);

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(504);
      expect(appError.envelope.code).toBe("PSI_TIMEOUT");
    }
  });
});

// T-ENGINE-004: PSI API returns 429 rate limit
describe("T-ENGINE-004: fetchPageSpeedData (rate limit — 429)", () => {
  it("throws AppError with PSI_RATE_LIMITED for 429 response", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(
        429,
        {
          error: {
            code: 429,
            message: "Rate Limit Exceeded",
            errors: [{ reason: "rateLimitExceeded" }],
          },
        },
        { "Retry-After": "60" }
      )
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(429);
      expect(appError.envelope.code).toBe("PSI_RATE_LIMITED");
      expect((appError.envelope.details as { retryAfter?: number })?.retryAfter).toBe(60);
    }
  });

  it("throws PSI_RATE_LIMITED for 403 with rateLimitExceeded reason", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(403, {
        error: {
          code: 403,
          message: "Rate Limit Exceeded",
          errors: [{ reason: "rateLimitExceeded" }],
        },
      })
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(429);
      expect(appError.envelope.code).toBe("PSI_RATE_LIMITED");
    }
  });
});

// T-ENGINE-005: PSI API returns 500 server error
describe("T-ENGINE-005: fetchPageSpeedData (server error — 500)", () => {
  it("throws AppError with PSI_SERVER_ERROR for 500 response", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(500, { error: { code: 500, message: "Internal Server Error" } })
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_SERVER_ERROR");
    }
  });

  it("throws AppError with PSI_SERVER_ERROR for 503 response", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(503, { error: { code: 503, message: "Service Unavailable" } })
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_SERVER_ERROR");
    }
  });
});

// Additional coverage: network errors, runtime errors, unexpected status codes
describe("fetchPageSpeedData (additional error paths)", () => {
  it("throws PSI_NETWORK_ERROR for TypeError (network failure)", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_NETWORK_ERROR");
    }
  });

  it("throws PSI_RUNTIME_ERROR for 200 with lighthouseResult.runtimeError", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        lighthouseResult: {
          runtimeError: { code: "ERRORED_DOCUMENT_REQUEST", message: "Could not load the page" },
        },
      })
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(400);
      expect(appError.envelope.code).toBe("PSI_RUNTIME_ERROR");
      expect(appError.message).toContain("Could not load the page");
    }
  });

  it("throws PSI_UNEXPECTED_ERROR for non-standard HTTP error (e.g. 418)", async () => {
    mockFetch.mockResolvedValue(mockResponse(418, { error: { message: "I'm a teapot" } }));

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_UNEXPECTED_ERROR");
    }
  });

  it("handles non-JSON error response body gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.reject(new Error("Not JSON")),
    } as Response);

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_SERVER_ERROR");
    }
  });

  it("wraps unknown non-Error throws as PSI_NETWORK_ERROR", async () => {
    mockFetch.mockRejectedValue("string error");

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_NETWORK_ERROR");
    }
  });

  it("handles runtime error with missing message", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        lighthouseResult: {
          runtimeError: { code: "UNKNOWN_ERROR" },
        },
      })
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.code).toBe("PSI_RUNTIME_ERROR");
      expect(appError.message).toContain("Lighthouse runtime error");
    }
  });

  it("throws PSI_NETWORK_ERROR for TypeError with 'network' in message", async () => {
    mockFetch.mockRejectedValue(new TypeError("network request failed"));

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_NETWORK_ERROR");
      expect(appError.message).toContain("network request failed");
    }
  });

  it("wraps non-network TypeError as PSI_NETWORK_ERROR via fallback", async () => {
    mockFetch.mockRejectedValue(new TypeError("Cannot read properties of undefined"));

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.status).toBe(502);
      expect(appError.envelope.code).toBe("PSI_NETWORK_ERROR");
      expect(appError.message).toContain("Failed to call PSI API");
    }
  });

  it("handles 429 without Retry-After header", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(429, {
        error: {
          code: 429,
          message: "Rate Limit Exceeded",
          errors: [{ reason: "rateLimitExceeded" }],
        },
      })
    );

    try {
      await fetchPageSpeedData("https://example.com", "mobile");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.envelope.code).toBe("PSI_RATE_LIMITED");
      expect((appError.envelope.details as { retryAfter?: number })?.retryAfter).toBeUndefined();
    }
  });
});
