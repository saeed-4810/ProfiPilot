import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAudit,
  getAuditStatus,
  isTerminalStatus,
  TERMINAL_STATUSES,
  type AuditStatus,
} from "../../lib/audit";

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
/* createAudit                                                        */
/* ------------------------------------------------------------------ */

describe("createAudit", () => {
  it("sends POST /audits with correct body and credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-123", status: "queued", createdAt: "2026-03-17T00:00:00Z" }),
    });

    const result = await createAudit("https://example.com");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(result).toEqual({
      jobId: "job-123",
      status: "queued",
      createdAt: "2026-03-17T00:00:00Z",
    });
  });

  it("throws with status and code on 400 validation error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid URL format",
      }),
    });

    await expect(createAudit("not-a-url")).rejects.toMatchObject({
      message: "Invalid URL format",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("throws with status and code on 401 auth error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Authentication required",
      }),
    });

    await expect(createAudit("https://example.com")).rejects.toMatchObject({
      message: "Authentication required",
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(createAudit("https://example.com")).rejects.toMatchObject({
      message: "Failed to create audit.",
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* getAuditStatus                                                     */
/* ------------------------------------------------------------------ */

describe("getAuditStatus", () => {
  it("sends GET /audits/:id/status with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-123",
        status: "running",
        retryCount: 0,
        createdAt: "2026-03-17T00:00:00Z",
        updatedAt: "2026-03-17T00:00:01Z",
      }),
    });

    const result = await getAuditStatus("job-123");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/audits/job-123/status", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    expect(result.status).toBe("running");
    expect(result.jobId).toBe("job-123");
  });

  it("throws with status on 404 not found", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        code: "AUDIT_NOT_FOUND",
        message: "Audit not found",
      }),
    });

    await expect(getAuditStatus("nonexistent")).rejects.toMatchObject({
      message: "Audit not found",
      status: 404,
      code: "AUDIT_NOT_FOUND",
    });
  });

  it("throws with status on 401 auth error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 401,
        code: "AUTH_NO_SESSION",
        message: "Not authenticated",
      }),
    });

    await expect(getAuditStatus("job-123")).rejects.toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
    });
  });

  it("uses fallback message when API error has no message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 500 }),
    });

    await expect(getAuditStatus("job-123")).rejects.toMatchObject({
      message: "Failed to get audit status.",
      code: "UNKNOWN",
    });
  });
});

/* ------------------------------------------------------------------ */
/* isTerminalStatus / TERMINAL_STATUSES                               */
/* ------------------------------------------------------------------ */

describe("isTerminalStatus", () => {
  it("returns true for completed", () => {
    expect(isTerminalStatus("completed")).toBe(true);
  });

  it("returns true for failed", () => {
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("returns true for cancelled", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
  });

  it("returns false for queued", () => {
    expect(isTerminalStatus("queued")).toBe(false);
  });

  it("returns false for running", () => {
    expect(isTerminalStatus("running")).toBe(false);
  });

  it("returns false for retrying", () => {
    expect(isTerminalStatus("retrying")).toBe(false);
  });
});

describe("TERMINAL_STATUSES", () => {
  it("contains exactly completed, failed, cancelled", () => {
    const expected: AuditStatus[] = ["completed", "failed", "cancelled"];
    expect([...TERMINAL_STATUSES].sort()).toEqual(expected.sort());
  });
});
