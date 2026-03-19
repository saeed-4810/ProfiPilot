import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuleEngineOutput } from "../src/domain/recommendation.js";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Firebase Admin mock ---
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ id: "auto-id" }));
const mockWhere = vi.fn();
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
        batch: vi.fn(() => ({
          set: mockBatchSet,
          commit: mockBatchCommit,
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
  mockWhere.mockReturnValue({ get: mockGetDocs });
});

/** Helper: standard rule engine output for testing. */
function makeRuleOutput(): RuleEngineOutput[] {
  return [
    {
      ruleId: "CWV-LCP-001",
      metric: "lcp",
      value: 3200,
      unit: "ms",
      rating: "needs-improvement",
      severity: "P2",
      category: "loading",
      suggestedFix: "Optimize largest contentful paint element...",
      evidence: { threshold: 2500, actual: 3200, delta: "+700ms" },
    },
    {
      ruleId: "CWV-CLS-001",
      metric: "cls",
      value: 0.3,
      unit: "score",
      rating: "poor",
      severity: "P1",
      category: "visual-stability",
      suggestedFix: "Reduce cumulative layout shift...",
      evidence: { threshold: 0.25, actual: 0.3, delta: "+0.05" },
    },
  ];
}

// T-AI-011 (partial): Recommendations saved to Firestore
describe("T-AI-011: saveRecommendations", () => {
  it("saves each recommendation as a separate Firestore document", async () => {
    const { saveRecommendations } = await import("../src/adapters/firestore-recommendation.js");
    const ruleOutput = makeRuleOutput();

    await saveRecommendations("audit-123", ruleOutput);

    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledOnce();

    // Verify first document shape
    const firstDoc = mockBatchSet.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(firstDoc["auditId"]).toBe("audit-123");
    expect(firstDoc["ruleId"]).toBe("CWV-LCP-001");
    expect(firstDoc["metric"]).toBe("lcp");
    expect(firstDoc["severity"]).toBe("P2");
    expect(firstDoc["category"]).toBe("loading");
    expect(firstDoc["currentValue"]).toBe("3.2s"); // formatted
    expect(firstDoc["targetValue"]).toBe("<2500ms");
    expect(firstDoc["createdAt"]).toBeDefined();
    expect(firstDoc["evidence"]).toEqual({ threshold: 2500, actual: 3200, delta: "+700ms" });

    // Verify second document
    const secondDoc = mockBatchSet.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(secondDoc["ruleId"]).toBe("CWV-CLS-001");
    expect(secondDoc["currentValue"]).toBe("0.30"); // score format
    expect(secondDoc["targetValue"]).toBe("<0.1");
  });

  it("does nothing when recommendations array is empty", async () => {
    const { saveRecommendations } = await import("../src/adapters/firestore-recommendation.js");

    await saveRecommendations("audit-123", []);

    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});

describe("getRecommendations", () => {
  it("returns recommendation documents for an audit", async () => {
    const mockDocs = [
      {
        data: () => ({
          auditId: "audit-123",
          ruleId: "CWV-LCP-001",
          metric: "lcp",
          currentValue: "3.2s",
          targetValue: "<2500ms",
          severity: "P2",
          category: "loading",
          suggestedFix: "Optimize...",
          evidence: { threshold: 2500, actual: 3200, delta: "+700ms" },
          createdAt: "2026-03-18T12:00:00.000Z",
        }),
      },
    ];

    mockGetDocs.mockResolvedValue({ docs: mockDocs });

    const { getRecommendations } = await import("../src/adapters/firestore-recommendation.js");
    const result = await getRecommendations("audit-123");

    expect(result).toHaveLength(1);
    expect(result[0]!.ruleId).toBe("CWV-LCP-001");
    expect(mockWhere).toHaveBeenCalledWith("auditId", "==", "audit-123");
  });

  it("returns empty array when no recommendations exist", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const { getRecommendations } = await import("../src/adapters/firestore-recommendation.js");
    const result = await getRecommendations("audit-nonexistent");

    expect(result).toEqual([]);
  });

  // T-PERF-129-002: getRecommendations silently filters corrupted documents (per ADR-017)
  it("silently filters corrupted documents via Zod safeParse", async () => {
    const validDoc = {
      data: () => ({
        auditId: "audit-123",
        ruleId: "CWV-LCP-001",
        metric: "lcp",
        currentValue: "3.2s",
        targetValue: "<2500ms",
        severity: "P2",
        category: "loading",
        suggestedFix: "Optimize...",
        evidence: { threshold: 2500, actual: 3200, delta: "+700ms" },
        createdAt: "2026-03-18T12:00:00.000Z",
      }),
    };

    const corruptedDoc = {
      data: () => ({
        auditId: "audit-123",
        // Missing required fields: ruleId, metric, severity, etc.
        someGarbage: true,
      }),
    };

    mockGetDocs.mockResolvedValue({ docs: [validDoc, corruptedDoc] });

    const { getRecommendations } = await import("../src/adapters/firestore-recommendation.js");
    const result = await getRecommendations("audit-123");

    // Only the valid document should be returned; corrupted one silently filtered
    expect(result).toHaveLength(1);
    expect(result[0]!.ruleId).toBe("CWV-LCP-001");
  });
});
