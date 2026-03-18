import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditMetrics } from "../src/domain/audit.js";
import type { RuleEngineOutput } from "../src/domain/recommendation.js";

// --- Mock OpenAI SDK ---
const mockCreate = vi.fn();

class MockAPIError extends Error {
  status: number | undefined;
  request_id: string | null;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.request_id = null;
  }
}

class MockAPIConnectionTimeoutError extends MockAPIError {
  constructor() {
    super("Request timed out");
    this.name = "APIConnectionTimeoutError";
  }
}

class MockRateLimitError extends MockAPIError {
  constructor() {
    super("Rate limit exceeded", 429);
    this.name = "RateLimitError";
  }
}

class MockAuthenticationError extends MockAPIError {
  constructor() {
    super("Invalid API key", 401);
    this.name = "AuthenticationError";
  }
}

class MockInternalServerError extends MockAPIError {
  constructor() {
    super("Internal server error", 500);
    this.name = "InternalServerError";
  }
}

vi.mock("openai", () => {
  const OpenAI = function OpenAI() {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  };

  OpenAI.APIError = MockAPIError;
  OpenAI.APIConnectionTimeoutError = MockAPIConnectionTimeoutError;
  OpenAI.RateLimitError = MockRateLimitError;
  OpenAI.AuthenticationError = MockAuthenticationError;
  OpenAI.InternalServerError = MockInternalServerError;

  return { default: OpenAI };
});

// Set env before importing modules that read it
process.env["OPENAI_API_KEY"] = "test-key";

// Reset the OpenAI client singleton before each test
beforeEach(async () => {
  vi.clearAllMocks();
  const { resetOpenAIClient } = await import("../src/lib/openai-client.js");
  resetOpenAIClient();
});

/** Helper: standard audit metrics for testing. */
function makeMetrics(overrides: Partial<AuditMetrics> = {}): AuditMetrics {
  return {
    lcp: 3200,
    cls: 0.15,
    tbt: 100,
    fcp: 1200,
    ttfb: 400,
    si: 3000,
    performanceScore: 0.72,
    lighthouseVersion: "12.0.0",
    fieldData: null,
    fetchedAt: "2026-03-18T12:00:00.000Z",
    ...overrides,
  };
}

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
      value: 0.15,
      unit: "score",
      rating: "needs-improvement",
      severity: "P2",
      category: "visual-stability",
      suggestedFix: "Reduce cumulative layout shift...",
      evidence: { threshold: 0.1, actual: 0.15, delta: "+0.05" },
    },
  ];
}

/** Helper: valid AI response matching rule engine output. */
function makeValidAIResponse(ruleOutput: RuleEngineOutput[]) {
  const content = {
    executiveSummary:
      "Your website's performance shows room for improvement in two key areas. " +
      "The Largest Contentful Paint (LCP) is 3.2 seconds, which exceeds the recommended 2.5-second threshold. " +
      "This means your main content takes too long to appear, potentially causing visitors to leave before seeing your page. " +
      "Additionally, the Cumulative Layout Shift (CLS) score of 0.15 indicates visual instability — elements on your page " +
      "are shifting around as it loads, which creates a frustrating user experience and can hurt your conversion rates.",
    tickets: ruleOutput.map((r) => ({
      title: `Optimize ${r.metric.toUpperCase()} performance to meet web standards`,
      description:
        `The ${r.metric.toUpperCase()} metric is currently at ${r.value}${r.unit === "ms" ? "ms" : ""}, ` +
        `which exceeds the ${r.evidence.threshold}${r.unit === "ms" ? "ms" : ""} threshold. ` +
        "This needs to be addressed to improve user experience and search engine rankings.",
      priority: r.severity,
      category: r.category,
      metric: r.metric,
      currentValue: r.unit === "ms" ? `${(r.value / 1000).toFixed(1)}s` : `${r.value}`,
      targetValue:
        r.unit === "ms"
          ? `<${(r.evidence.threshold / 1000).toFixed(1)}s`
          : `<${r.evidence.threshold}`,
      estimatedImpact: r.severity === "P1" ? "high" : "medium",
      suggestedFix:
        `1. Analyze the ${r.metric.toUpperCase()} element using Chrome DevTools Performance panel. ` +
        `2. ${r.suggestedFix} ` +
        "3. Verify improvement by running a new audit after changes are deployed.",
    })),
  };

  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: Date.now(),
    model: "gpt-4o-2024-08-06",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify(content),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1500,
      completion_tokens: 800,
      total_tokens: 2300,
    },
  };
}

// T-AI-005: GPT-4o returns valid structured JSON
describe("T-AI-005: GPT-4o returns valid structured JSON", () => {
  it("Zod validation passes, tickets match rule engine count", async () => {
    const ruleOutput = makeRuleOutput();
    mockCreate.mockResolvedValue(makeValidAIResponse(ruleOutput));

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(true);
    expect(result.executiveSummary).toBeTruthy();
    expect(result.tickets).toHaveLength(2);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.modelVersion).toBe("gpt-4o-2024-08-06");
    expect(result.metadata!.promptVersion).toBe("v1");
    expect(result.metadata!.temperature).toBe(0.3);
    expect(result.metadata!.inputTokens).toBe(1500);
    expect(result.metadata!.outputTokens).toBe(800);
    expect(result.metadata!.costUsd).toBeGreaterThan(0);
    expect(result.metadata!.promptHash).toHaveLength(64);
    expect(result.metadata!.inputHash).toHaveLength(64);
  });
});

// T-AI-006: GPT-4o returns mismatched ticket count
describe("T-AI-006: GPT-4o returns mismatched ticket count", () => {
  it("falls back to rule engine output when ticket count mismatches", async () => {
    const ruleOutput = makeRuleOutput();

    // First call: wrong ticket count (1 instead of 2)
    const badResponse = makeValidAIResponse(ruleOutput);
    const content = JSON.parse(badResponse.choices[0]!.message.content!);
    content.tickets = [content.tickets[0]]; // Remove one ticket
    badResponse.choices[0]!.message.content = JSON.stringify(content);

    // Both attempts return bad response
    mockCreate.mockResolvedValue(badResponse);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("validation_failed");
    expect(result.tickets).toEqual(ruleOutput);
    expect(result.executiveSummary).toBeNull();
  });
});

// T-AI-007: GPT-4o returns wrong priority on ticket
describe("T-AI-007: GPT-4o returns wrong priority on ticket", () => {
  it("overrides priority with rule engine value", async () => {
    const ruleOutput = makeRuleOutput();
    const response = makeValidAIResponse(ruleOutput);

    // Tamper with priority — AI returns P1 instead of P2
    const content = JSON.parse(response.choices[0]!.message.content!);
    content.tickets[0].priority = "P1";
    response.choices[0]!.message.content = JSON.stringify(content);

    mockCreate.mockResolvedValue(response);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(true);
    // Priority should be overridden to match rule engine
    const tickets = result.tickets as Array<{ priority: string }>;
    expect(tickets[0]!.priority).toBe("P2"); // Rule engine says P2
    expect(tickets[1]!.priority).toBe("P2");
  });

  it("overrides category with rule engine value", async () => {
    const ruleOutput = makeRuleOutput();
    const response = makeValidAIResponse(ruleOutput);

    // Tamper with category
    const content = JSON.parse(response.choices[0]!.message.content!);
    content.tickets[0].category = "server"; // Wrong — should be "loading"
    response.choices[0]!.message.content = JSON.stringify(content);

    mockCreate.mockResolvedValue(response);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(true);
    const tickets = result.tickets as Array<{ category: string }>;
    expect(tickets[0]!.category).toBe("loading"); // Overridden
    expect(tickets[1]!.category).toBe("visual-stability"); // Overridden
  });
});

// T-AI-008: GPT-4o API timeout (60s)
describe("T-AI-008: GPT-4o API timeout", () => {
  it("retries once then falls back with fallbackReason timeout", async () => {
    mockCreate.mockRejectedValue(new MockAPIConnectionTimeoutError());

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("timeout");
    expect(result.tickets).toEqual(ruleOutput);
    // Only 1 call because the first call throws before retry logic
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

// T-AI-009: GPT-4o API returns 429
describe("T-AI-009: GPT-4o API returns 429", () => {
  it("falls back with fallbackReason rate_limited", async () => {
    mockCreate.mockRejectedValue(new MockRateLimitError());

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("rate_limited");
    expect(result.tickets).toEqual(ruleOutput);
  });
});

// T-AI-010: OpenAI API key invalid
describe("T-AI-010: OpenAI API key invalid", () => {
  it("falls back immediately with fallbackReason openai_unavailable", async () => {
    mockCreate.mockRejectedValue(new MockAuthenticationError());

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("openai_unavailable");
    expect(result.tickets).toEqual(ruleOutput);
  });
});

// P-AI-001: Audit with poor LCP produces business-friendly summary
describe("P-AI-001: Business-friendly executive summary", () => {
  it("executive summary mentions LCP impact on user experience", async () => {
    const ruleOutput: RuleEngineOutput[] = [
      {
        ruleId: "CWV-LCP-001",
        metric: "lcp",
        value: 5000,
        unit: "ms",
        rating: "poor",
        severity: "P1",
        category: "loading",
        suggestedFix: "Optimize largest contentful paint element...",
        evidence: { threshold: 4000, actual: 5000, delta: "+1000ms" },
      },
    ];

    const response = makeValidAIResponse(ruleOutput);
    mockCreate.mockResolvedValue(response);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics({ lcp: 5000 }),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(true);
    expect(result.executiveSummary).toBeTruthy();
    // The executive summary should be a meaningful string
    expect(result.executiveSummary!.length).toBeGreaterThan(100);
  });
});

// P-AI-002: AI unavailable — product still works
describe("P-AI-002: Product works without AI", () => {
  it("returns rule engine recommendations without narrative", async () => {
    mockCreate.mockRejectedValue(new MockInternalServerError());

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.tickets).toEqual(ruleOutput);
    expect(result.tickets).toHaveLength(2);
    // Rule engine output is still usable
    expect(result.tickets[0]!).toHaveProperty("ruleId");
    expect(result.tickets[0]!).toHaveProperty("severity");
    expect(result.tickets[0]!).toHaveProperty("suggestedFix");
  });
});

// Edge cases
describe("AI narrative edge cases", () => {
  it("returns empty result when rule engine output is empty", async () => {
    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics({ lcp: 1500, cls: 0.05 }),
      []
    );

    expect(result.aiAvailable).toBe(true);
    expect(result.executiveSummary).toBeNull();
    expect(result.tickets).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("falls back when AI returns invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        { index: 0, message: { role: "assistant", content: "not json" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    });

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("validation_failed");
    // Called twice: first attempt + retry
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back when AI returns null content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
    });

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("validation_failed");
  });

  it("falls back when AI returns empty choices", async () => {
    mockCreate.mockResolvedValue({
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
    });

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const ruleOutput = makeRuleOutput();
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("validation_failed");
  });

  it("falls back when ticket references hallucinated metric", async () => {
    const ruleOutput = makeRuleOutput();
    const response = makeValidAIResponse(ruleOutput);

    // Tamper: change metric to a hallucinated one
    const content = JSON.parse(response.choices[0]!.message.content!);
    content.tickets[0].metric = "fake_metric";
    response.choices[0]!.message.content = JSON.stringify(content);

    mockCreate.mockResolvedValue(response);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("validation_failed");
  });

  it("succeeds on retry when first attempt fails validation", async () => {
    const ruleOutput = makeRuleOutput();

    // First call: bad response (wrong ticket count)
    const badResponse = makeValidAIResponse(ruleOutput);
    const badContent = JSON.parse(badResponse.choices[0]!.message.content!);
    badContent.tickets = [badContent.tickets[0]];
    badResponse.choices[0]!.message.content = JSON.stringify(badContent);

    // Second call: good response
    const goodResponse = makeValidAIResponse(ruleOutput);

    mockCreate.mockResolvedValueOnce(badResponse).mockResolvedValueOnce(goodResponse);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(true);
    expect(result.tickets).toHaveLength(2);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back when retry also throws API error", async () => {
    const ruleOutput = makeRuleOutput();

    // First call: bad validation
    const badResponse = makeValidAIResponse(ruleOutput);
    const badContent = JSON.parse(badResponse.choices[0]!.message.content!);
    badContent.tickets = [];
    badResponse.choices[0]!.message.content = JSON.stringify(badContent);

    // First call: bad validation, second call: timeout
    mockCreate
      .mockResolvedValueOnce(badResponse)
      .mockRejectedValueOnce(new MockAPIConnectionTimeoutError());

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("timeout");
  });

  it("handles Zod validation failure (executiveSummary too short)", async () => {
    const ruleOutput = makeRuleOutput();
    const response = makeValidAIResponse(ruleOutput);

    const content = JSON.parse(response.choices[0]!.message.content!);
    content.executiveSummary = "Too short"; // min 100 chars
    response.choices[0]!.message.content = JSON.stringify(content);

    mockCreate.mockResolvedValue(response);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toBe("validation_failed");
  });
});

// Edge case: usage is null/undefined in completion
describe("AI narrative: null usage in completion", () => {
  it("defaults to 0 tokens when usage is null", async () => {
    const ruleOutput = makeRuleOutput();
    const response = makeValidAIResponse(ruleOutput);
    (response as Record<string, unknown>).usage = null;

    mockCreate.mockResolvedValue(response);

    const { generateAISummary } = await import("../src/services/ai-narrative.js");
    const result = await generateAISummary(
      "audit-123",
      "https://example.com",
      "mobile",
      makeMetrics(),
      ruleOutput
    );

    expect(result.aiAvailable).toBe(true);
    expect(result.metadata!.inputTokens).toBe(0);
    expect(result.metadata!.outputTokens).toBe(0);
    expect(result.metadata!.costUsd).toBe(0);
  });
});

// OpenAI client module tests
describe("OpenAI client module", () => {
  it("computeCostUsd calculates correctly", async () => {
    const { computeCostUsd } = await import("../src/lib/openai-client.js");

    // 1500 input tokens * $0.005/1K + 800 output tokens * $0.015/1K
    // = $0.0075 + $0.012 = $0.0195
    const cost = computeCostUsd(1500, 800);
    expect(cost).toBeCloseTo(0.0195, 4);
  });

  it("computeCostUsd returns 0 for zero tokens", async () => {
    const { computeCostUsd } = await import("../src/lib/openai-client.js");
    expect(computeCostUsd(0, 0)).toBe(0);
  });

  it("getOpenAIClient throws when OPENAI_API_KEY is not set", async () => {
    const { resetOpenAIClient, getOpenAIClient } = await import("../src/lib/openai-client.js");
    resetOpenAIClient();

    const originalKey = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];

    try {
      expect(() => getOpenAIClient()).toThrow("OPENAI_API_KEY env var is required");
    } finally {
      process.env["OPENAI_API_KEY"] = originalKey;
    }
  });

  it("getOpenAIClient returns singleton", async () => {
    const { resetOpenAIClient, getOpenAIClient } = await import("../src/lib/openai-client.js");
    resetOpenAIClient();

    const client1 = getOpenAIClient();
    const client2 = getOpenAIClient();
    expect(client1).toBe(client2);
  });
});
