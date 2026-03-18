import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AISummaryResult } from "../src/domain/recommendation.js";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Firebase Admin mock ---
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ set: mockSet }));
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockGetDocs = vi.fn();

vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(() => ({
      name: "mock-app",
      auth: () => ({}),
      firestore: () => ({
        collection: vi.fn(() => ({
          doc: mockDoc,
          where: mockWhere,
        })),
      }),
    })),
    credential: {
      cert: vi.fn(() => "mock-cert"),
      applicationDefault: vi.fn(() => "mock-adc"),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ get: mockGetDocs });
});

/** Helper: create a valid AISummaryResult with AI available. */
function makeSummaryResult(): AISummaryResult {
  return {
    auditId: "audit-123",
    executiveSummary: "Your website performance needs improvement...",
    tickets: [
      {
        title: "Optimize LCP performance to meet web standards",
        description:
          "The LCP metric is currently at 3200ms, which exceeds the 2500ms threshold. This needs to be addressed.",
        priority: "P2",
        category: "loading",
        metric: "lcp",
        currentValue: "3.2s",
        targetValue: "<2.5s",
        estimatedImpact: "medium",
        suggestedFix:
          "1. Analyze the LCP element using Chrome DevTools. 2. Compress images. 3. Verify improvement.",
      },
    ],
    aiAvailable: true,
    metadata: {
      modelVersion: "gpt-4o-2024-08-06",
      promptHash: "abc123def456",
      promptVersion: "v1",
      temperature: 0.3,
      inputHash: "xyz789",
      generatedAt: "2026-03-18T12:00:00.000Z",
      latencyMs: 2500,
      inputTokens: 1500,
      outputTokens: 800,
      costUsd: 0.0195,
    },
  };
}

// T-AI-011 (partial): Summary metadata stored in Firestore
describe("T-AI-011: saveSummary", () => {
  it("stores all 10 metadata fields per ADR-013", async () => {
    const { saveSummary } = await import("../src/adapters/firestore-summary.js");
    const summary = makeSummaryResult();

    await saveSummary("audit-123", summary);

    expect(mockSet).toHaveBeenCalledOnce();
    const doc = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;

    // Verify all 10 metadata fields
    expect(doc["auditId"]).toBe("audit-123");
    expect(doc["modelVersion"]).toBe("gpt-4o-2024-08-06");
    expect(doc["promptHash"]).toBe("abc123def456");
    expect(doc["promptVersion"]).toBe("v1");
    expect(doc["temperature"]).toBe(0.3);
    expect(doc["inputHash"]).toBe("xyz789");
    expect(doc["generatedAt"]).toBe("2026-03-18T12:00:00.000Z");
    expect(doc["latencyMs"]).toBe(2500);
    expect(doc["inputTokens"]).toBe(1500);
    expect(doc["outputTokens"]).toBe(800);
    expect(doc["costUsd"]).toBe(0.0195);

    // Verify content field
    const content = doc["content"] as Record<string, unknown>;
    expect(content["executiveSummary"]).toBe("Your website performance needs improvement...");
    expect(content["tickets"]).toHaveLength(1);
  });

  it("does not save when AI is unavailable (fallback)", async () => {
    const { saveSummary } = await import("../src/adapters/firestore-summary.js");
    const fallbackSummary: AISummaryResult = {
      auditId: "audit-123",
      executiveSummary: null,
      tickets: [],
      aiAvailable: false,
      fallbackReason: "timeout",
    };

    await saveSummary("audit-123", fallbackSummary);

    expect(mockSet).not.toHaveBeenCalled();
  });

  it("handles null executiveSummary with empty string fallback", async () => {
    const { saveSummary } = await import("../src/adapters/firestore-summary.js");
    const summary = makeSummaryResult();
    summary.executiveSummary = null;

    await saveSummary("audit-123", summary);

    expect(mockSet).toHaveBeenCalledOnce();
    const doc = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    const content = doc["content"] as Record<string, unknown>;
    expect(content["executiveSummary"]).toBe("");
  });

  it("does not save when metadata is missing", async () => {
    const { saveSummary } = await import("../src/adapters/firestore-summary.js");
    const noMetadata: AISummaryResult = {
      auditId: "audit-123",
      executiveSummary: null,
      tickets: [],
      aiAvailable: true,
      // No metadata
    };

    await saveSummary("audit-123", noMetadata);

    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("getSummary", () => {
  it("returns the most recent summary for an audit", async () => {
    const mockDocData = {
      auditId: "audit-123",
      modelVersion: "gpt-4o-2024-08-06",
      promptHash: "abc123",
      promptVersion: "v1",
      temperature: 0.3,
      inputHash: "xyz789",
      content: {
        executiveSummary: "Performance summary...",
        tickets: [],
      },
      generatedAt: "2026-03-18T12:00:00.000Z",
      latencyMs: 2500,
      inputTokens: 1500,
      outputTokens: 800,
      costUsd: 0.0195,
    };

    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [{ data: () => mockDocData }],
    });

    const { getSummary } = await import("../src/adapters/firestore-summary.js");
    const result = await getSummary("audit-123");

    expect(result).not.toBeNull();
    expect(result!.auditId).toBe("audit-123");
    expect(result!.aiAvailable).toBe(true);
    expect(result!.executiveSummary).toBe("Performance summary...");
    expect(result!.metadata!.modelVersion).toBe("gpt-4o-2024-08-06");
    expect(result!.metadata!.latencyMs).toBe(2500);

    expect(mockWhere).toHaveBeenCalledWith("auditId", "==", "audit-123");
    expect(mockOrderBy).toHaveBeenCalledWith("generatedAt", "desc");
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("returns null when no summary exists", async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

    const { getSummary } = await import("../src/adapters/firestore-summary.js");
    const result = await getSummary("audit-nonexistent");

    expect(result).toBeNull();
  });
});
