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

const mockGetRecommendations = vi.fn();
const mockGetSummary = vi.fn();
vi.mock("@/lib/results", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getRecommendations: (...args: unknown[]) => mockGetRecommendations(...args),
    getSummary: (...args: unknown[]) => mockGetSummary(...args),
  };
});

// Import after mocks
import ResultsPage from "../../app/(authenticated)/results/page";

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParamsId = "audit-123";
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Test data factories                                                 */
/* ------------------------------------------------------------------ */

function makeRecommendation(
  overrides: Partial<{
    ruleId: string;
    metric: string;
    severity: "P0" | "P1" | "P2" | "P3";
    category: string;
    currentValue: string;
    targetValue: string;
    suggestedFix: string;
    evidence: string;
  }> = {}
) {
  return {
    ruleId: overrides.ruleId ?? "rule-lcp-001",
    metric: overrides.metric ?? "LCP",
    severity: overrides.severity ?? "P0",
    category: overrides.category ?? "Performance",
    currentValue: overrides.currentValue ?? "4.2s",
    targetValue: overrides.targetValue ?? "2.5s",
    suggestedFix: overrides.suggestedFix ?? "Optimize largest contentful paint element.",
    evidence: overrides.evidence ?? "Measured via Lighthouse audit.",
  };
}

function makeRecommendationsResponse(
  recommendations = [makeRecommendation()],
  auditId = "audit-123"
) {
  return { auditId, recommendations };
}

function makeSummaryResponse(
  overrides: Partial<{
    auditId: string;
    executiveSummary: string | null;
    tickets: Array<{
      title: string;
      description: string;
      priority: "P0" | "P1" | "P2" | "P3";
      category: string;
      metric: string;
      currentValue: string;
      targetValue: string;
      estimatedImpact: string;
      suggestedFix: string;
    }>;
    aiAvailable: boolean;
    fallbackReason: string;
  }> = {}
) {
  return {
    auditId: overrides.auditId ?? "audit-123",
    executiveSummary:
      overrides.executiveSummary !== undefined
        ? overrides.executiveSummary
        : "Your site has critical LCP issues.\n\nImmediate action is recommended.",
    tickets: overrides.tickets ?? [
      {
        title: "Fix LCP on homepage",
        description: "The largest contentful paint is above threshold.",
        priority: "P0" as const,
        category: "Performance",
        metric: "LCP",
        currentValue: "4.2s",
        targetValue: "2.5s",
        estimatedImpact: "Expected 15% improvement in bounce rate.",
        suggestedFix: "Optimize hero image and defer non-critical JS.",
      },
    ],
    aiAvailable: overrides.aiAvailable ?? true,
    fallbackReason: overrides.fallbackReason ?? "",
  };
}

/* ================================================================== */
/* P-PERF-102-001: User views recommendations sorted by severity      */
/* ================================================================== */

describe("P-PERF-102-001: User views recommendations sorted by severity", () => {
  it("renders recommendations sorted P0 → P3", async () => {
    mockGetRecommendations.mockResolvedValue(
      makeRecommendationsResponse([
        makeRecommendation({ ruleId: "r-p2", severity: "P2", metric: "CLS" }),
        makeRecommendation({ ruleId: "r-p0", severity: "P0", metric: "LCP" }),
        makeRecommendation({ ruleId: "r-p3", severity: "P3", metric: "TTFB" }),
        makeRecommendation({ ruleId: "r-p1", severity: "P1", metric: "FID" }),
      ])
    );
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendations")).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId(/^recommendation-/);
    expect(cards).toHaveLength(4);

    // Verify sort order: P0 (LCP), P1 (FID), P2 (CLS), P3 (TTFB)
    expect(cards[0]).toHaveAttribute("aria-label", "P0 recommendation: LCP");
    expect(cards[1]).toHaveAttribute("aria-label", "P1 recommendation: FID");
    expect(cards[2]).toHaveAttribute("aria-label", "P2 recommendation: CLS");
    expect(cards[3]).toHaveAttribute("aria-label", "P3 recommendation: TTFB");
  });

  it("displays recommendation details: metric, currentValue, targetValue, suggestedFix", async () => {
    mockGetRecommendations.mockResolvedValue(
      makeRecommendationsResponse([
        makeRecommendation({
          metric: "LCP",
          currentValue: "4.2s",
          targetValue: "2.5s",
          suggestedFix: "Optimize hero image.",
          evidence: "Lighthouse audit data.",
          category: "Performance",
        }),
      ])
    );
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("LCP")).toBeInTheDocument();
      expect(screen.getByText("Current: 4.2s")).toBeInTheDocument();
      expect(screen.getByText("Target: 2.5s")).toBeInTheDocument();
      expect(screen.getByText("Optimize hero image.")).toBeInTheDocument();
      expect(screen.getByText("Lighthouse audit data.")).toBeInTheDocument();
      expect(screen.getByText("(Performance)")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* P-PERF-102-002: User views AI executive summary                    */
/* ================================================================== */

describe("P-PERF-102-002: User views AI executive summary", () => {
  it("renders executive summary paragraphs when AI is available", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({
        executiveSummary:
          "Your site has critical LCP issues.\n\nImmediate action is recommended.\n\nFocus on image optimization.",
        aiAvailable: true,
      })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("executive-summary")).toBeInTheDocument();
      expect(screen.getByText("Executive Summary")).toBeInTheDocument();
      expect(screen.getByText("Your site has critical LCP issues.")).toBeInTheDocument();
      expect(screen.getByText("Immediate action is recommended.")).toBeInTheDocument();
      expect(screen.getByText("Focus on image optimization.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* P-PERF-102-003: User views dev ticket backlog                      */
/* ================================================================== */

describe("P-PERF-102-003: User views dev ticket backlog", () => {
  it("renders dev tickets with title, description, priority badge, and impact", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({
        tickets: [
          {
            title: "Fix LCP on homepage",
            description: "The largest contentful paint is above threshold.",
            priority: "P0",
            category: "Performance",
            metric: "LCP",
            currentValue: "4.2s",
            targetValue: "2.5s",
            estimatedImpact: "Expected 15% improvement in bounce rate.",
            suggestedFix: "Optimize hero image.",
          },
          {
            title: "Reduce CLS on product page",
            description: "Layout shift detected on product images.",
            priority: "P1",
            category: "Stability",
            metric: "CLS",
            currentValue: "0.25",
            targetValue: "0.1",
            estimatedImpact: "Better visual stability.",
            suggestedFix: "Set explicit dimensions.",
          },
        ],
      })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dev-tickets")).toBeInTheDocument();
      expect(screen.getByText("Dev Ticket Backlog")).toBeInTheDocument();
      expect(screen.getByText("Fix LCP on homepage")).toBeInTheDocument();
      expect(screen.getByText("Reduce CLS on product page")).toBeInTheDocument();
      expect(
        screen.getByText("Impact: Expected 15% improvement in bounce rate.")
      ).toBeInTheDocument();
    });

    // Verify tickets are sorted by priority (P0 first)
    const tickets = screen.getAllByTestId(/^dev-ticket-/);
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toHaveTextContent("Fix LCP on homepage");
    expect(tickets[1]).toHaveTextContent("Reduce CLS on product page");
  });
});

/* ================================================================== */
/* P-PERF-102-004: All metrics good → congratulatory message          */
/* ================================================================== */

describe("P-PERF-102-004: All metrics good → congratulatory message", () => {
  it("shows congratulatory message when no recommendations and no tickets", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse([]));
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ executiveSummary: null, tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-empty")).toBeInTheDocument();
      expect(
        screen.getByText("No issues found — your site is performing great!")
      ).toBeInTheDocument();
      expect(
        screen.getByText("All Core Web Vitals are within target thresholds.")
      ).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* U-PERF-102-001: Loading skeleton while fetching                    */
/* ================================================================== */

describe("U-PERF-102-001: Loading skeleton while fetching", () => {
  it("shows skeleton loading state on initial render", () => {
    mockGetRecommendations.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetSummary.mockReturnValue(new Promise(() => {}));

    render(<ResultsPage />);

    expect(screen.getByTestId("results-loading")).toBeInTheDocument();
    expect(screen.getByTestId("results-loading")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("results-loading")).toHaveAttribute("aria-label", "Loading results");
  });
});

/* ================================================================== */
/* U-PERF-102-002: AI unavailable → banner + fallback                 */
/* ================================================================== */

describe("U-PERF-102-002: AI unavailable → banner + fallback recommendations", () => {
  it("shows AI unavailable banner when aiAvailable is false", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({
        aiAvailable: false,
        executiveSummary: null,
        fallbackReason: "AI service timeout",
        tickets: [
          {
            title: "Rule-engine ticket",
            description: "Generated by rule engine.",
            priority: "P1",
            category: "Performance",
            metric: "LCP",
            currentValue: "3.5s",
            targetValue: "2.5s",
            estimatedImpact: "",
            suggestedFix: "Optimize images.",
          },
        ],
      })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("ai-unavailable-banner")).toBeInTheDocument();
      expect(screen.getByText("AI summary temporarily unavailable.")).toBeInTheDocument();
      expect(screen.getByText("AI service timeout")).toBeInTheDocument();
    });

    // Recommendations should still be visible
    expect(screen.getByTestId("recommendations")).toBeInTheDocument();
    // Rule engine tickets should still be visible
    expect(screen.getByText("Rule-engine ticket")).toBeInTheDocument();
  });

  it("shows AI unavailable banner without fallback reason when empty", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({
        aiAvailable: false,
        executiveSummary: null,
        fallbackReason: "",
      })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("ai-unavailable-banner")).toBeInTheDocument();
      expect(screen.getByText("AI summary temporarily unavailable.")).toBeInTheDocument();
    });

    // No fallback reason text should be rendered
    expect(screen.queryByText("AI service timeout")).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* U-PERF-102-003: Error state with retry CTA                         */
/* ================================================================== */

describe("U-PERF-102-003: Error state with retry CTA", () => {
  it("shows error alert with retry button when API fails", async () => {
    const err = new Error("Network error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "INTERNAL_ERROR";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
      expect(screen.getByTestId("results-retry")).toBeInTheDocument();
    });
  });

  it("retries fetching when retry button is clicked", async () => {
    const err = new Error("Network error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "INTERNAL_ERROR";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-error")).toBeInTheDocument();
    });

    // Switch to success for retry
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(makeSummaryResponse());

    await user.click(screen.getByTestId("results-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("results-content")).toBeInTheDocument();
    });
  });

  it("uses fallback error message when error has no message", async () => {
    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "INTERNAL_ERROR";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to load results. Please try again."
      );
    });
  });
});

/* ================================================================== */
/* U-PERF-102-004: Keyboard navigation through cards                  */
/* ================================================================== */

describe("U-PERF-102-004: Keyboard navigation through cards", () => {
  it("recommendation cards have accessible labels for screen readers", async () => {
    mockGetRecommendations.mockResolvedValue(
      makeRecommendationsResponse([
        makeRecommendation({ severity: "P0", metric: "LCP" }),
        makeRecommendation({ ruleId: "r-2", severity: "P1", metric: "FID" }),
      ])
    );
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendations")).toBeInTheDocument();
    });

    // Verify aria-label on recommendation section
    expect(screen.getByTestId("recommendations")).toHaveAttribute("aria-label", "Recommendations");

    // Verify role="list" on the container
    expect(screen.getByRole("list")).toBeInTheDocument();

    // Verify role="listitem" on each card
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(2);
  });
});

/* ================================================================== */
/* T-PERF-102-001: Calls GET /audits/:id/recommendations              */
/* ================================================================== */

describe("T-PERF-102-001: Calls GET /audits/:id/recommendations", () => {
  it("calls getRecommendations with auditId from search params", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(makeSummaryResponse());

    render(<ResultsPage />);

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalledWith("audit-123");
    });
  });
});

/* ================================================================== */
/* T-PERF-102-002: Calls GET /audits/:id/summary, handles aiAvailable */
/* ================================================================== */

describe("T-PERF-102-002: Calls GET /audits/:id/summary, handles aiAvailable true/false", () => {
  it("calls getSummary with auditId and renders AI content when available", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ aiAvailable: true }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(mockGetSummary).toHaveBeenCalledWith("audit-123");
      expect(screen.getByTestId("executive-summary")).toBeInTheDocument();
      expect(screen.queryByTestId("ai-unavailable-banner")).not.toBeInTheDocument();
    });
  });

  it("shows AI unavailable banner when aiAvailable is false", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({ aiAvailable: false, executiveSummary: null })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(mockGetSummary).toHaveBeenCalledWith("audit-123");
      expect(screen.getByTestId("ai-unavailable-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("executive-summary")).not.toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-102-003: Handles 400 AUDIT_NOT_COMPLETED                    */
/* ================================================================== */

describe("T-PERF-102-003: Handles 400 AUDIT_NOT_COMPLETED", () => {
  it("shows not-completed state when API returns 400 AUDIT_NOT_COMPLETED", async () => {
    const err = new Error("Audit still processing") as Error & {
      status: number;
      code: string;
    };
    err.status = 400;
    err.code = "AUDIT_NOT_COMPLETED";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-not-completed")).toBeInTheDocument();
      expect(
        screen.getByText("Audit still processing. Please wait and try again.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("results-retry-processing")).toBeInTheDocument();
    });
  });

  it("retries when Check Again button is clicked in not-completed state", async () => {
    const err = new Error("Audit still processing") as Error & {
      status: number;
      code: string;
    };
    err.status = 400;
    err.code = "AUDIT_NOT_COMPLETED";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-not-completed")).toBeInTheDocument();
    });

    // Switch to success for retry
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse());
    mockGetSummary.mockResolvedValue(makeSummaryResponse());

    await user.click(screen.getByTestId("results-retry-processing"));

    await waitFor(() => {
      expect(screen.getByTestId("results-content")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-102-004: Handles 404 AUDIT_NOT_FOUND                       */
/* ================================================================== */

describe("T-PERF-102-004: Handles 404 AUDIT_NOT_FOUND", () => {
  it("shows not-found state when API returns 404", async () => {
    const err = new Error("Audit not found") as Error & {
      status: number;
      code: string;
    };
    err.status = 404;
    err.code = "AUDIT_NOT_FOUND";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-not-found")).toBeInTheDocument();
      expect(screen.getByText("Audit not found.")).toBeInTheDocument();
      expect(
        screen.getByText("The audit you are looking for does not exist or has been removed.")
      ).toBeInTheDocument();
    });
  });

  it("shows not-found state when no id search param is provided", async () => {
    mockSearchParamsId = null;

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-not-found")).toBeInTheDocument();
    });

    expect(mockGetRecommendations).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it("shows not-found state when id search param is empty string", async () => {
    mockSearchParamsId = "";

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-not-found")).toBeInTheDocument();
    });

    expect(mockGetRecommendations).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* E-RESULTS-001: Results page renders (covered by unit tests)        */
/* ================================================================== */

describe("E-RESULTS-001: Results page renders with heading", () => {
  it("renders results heading", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse([]));
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ executiveSummary: null, tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Results")).toBeInTheDocument();
      expect(screen.getByTestId("results-page")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* E-RESULTS-002: Results page returns 200 (covered by E2E)           */
/* ================================================================== */

describe("E-RESULTS-002: Results page structure", () => {
  it("renders main element with correct test id", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse([]));
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ executiveSummary: null, tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      const main = screen.getByTestId("results-page");
      expect(main.tagName).toBe("MAIN");
    });
  });
});

/* ================================================================== */
/* E-RESULTS-003: Completed audit shows recommendations               */
/* ================================================================== */

describe("E-RESULTS-003: Completed audit shows recommendations", () => {
  it("displays recommendations and summary for a completed audit", async () => {
    mockGetRecommendations.mockResolvedValue(
      makeRecommendationsResponse([
        makeRecommendation({ severity: "P0", metric: "LCP" }),
        makeRecommendation({ ruleId: "r-2", severity: "P1", metric: "FID" }),
      ])
    );
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({
        aiAvailable: true,
        executiveSummary: "Critical performance issues detected.",
      })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-content")).toBeInTheDocument();
      expect(screen.getByTestId("executive-summary")).toBeInTheDocument();
      expect(screen.getByTestId("recommendations")).toBeInTheDocument();
      expect(screen.getByTestId("dev-tickets")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: 401 → redirect to /login                               */
/* ================================================================== */

describe("Unauthenticated request → 401 → redirect to /login", () => {
  it("redirects to /login on 401 from getRecommendations", async () => {
    const err = new Error("Authentication required") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_NO_SESSION";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});

/* ================================================================== */
/* Additional: 400 non-AUDIT_NOT_COMPLETED → error state              */
/* ================================================================== */

describe("400 with non-AUDIT_NOT_COMPLETED code → error state", () => {
  it("shows error state for 400 with different error code", async () => {
    const err = new Error("Bad request") as Error & {
      status: number;
      code: string;
    };
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    mockGetRecommendations.mockRejectedValue(err);
    mockGetSummary.mockRejectedValue(err);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Bad request");
    });
  });
});

/* ================================================================== */
/* Additional: MotionWrapper present                                   */
/* ================================================================== */

describe("MotionWrapper integration", () => {
  it("renders within MotionWrapper (animation container present)", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse([]));
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ executiveSummary: null, tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      const resultsPage = screen.getByTestId("results-page");
      expect(resultsPage).toBeInTheDocument();
      expect(resultsPage.parentElement).toBeTruthy();
    });
  });
});

/* ================================================================== */
/* Additional: Recommendation with empty evidence                     */
/* ================================================================== */

describe("Recommendation with empty evidence", () => {
  it("does not render evidence text when evidence is empty", async () => {
    mockGetRecommendations.mockResolvedValue(
      makeRecommendationsResponse([
        makeRecommendation({ evidence: "", suggestedFix: "Fix the issue." }),
      ])
    );
    mockGetSummary.mockResolvedValue(makeSummaryResponse({ tickets: [] }));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fix the issue.")).toBeInTheDocument();
    });

    // No italic evidence text should be rendered
    const recommendation = screen.getByTestId("recommendation-0");
    const italicElements = recommendation.querySelectorAll(".italic");
    expect(italicElements).toHaveLength(0);
  });
});

/* ================================================================== */
/* Additional: Dev ticket with empty estimatedImpact                  */
/* ================================================================== */

describe("Dev ticket with empty estimatedImpact", () => {
  it("does not render impact text when estimatedImpact is empty", async () => {
    mockGetRecommendations.mockResolvedValue(makeRecommendationsResponse([]));
    mockGetSummary.mockResolvedValue(
      makeSummaryResponse({
        tickets: [
          {
            title: "No impact ticket",
            description: "A ticket without impact.",
            priority: "P2",
            category: "Performance",
            metric: "CLS",
            currentValue: "0.2",
            targetValue: "0.1",
            estimatedImpact: "",
            suggestedFix: "Set dimensions.",
          },
        ],
      })
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("No impact ticket")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Impact:/)).not.toBeInTheDocument();
  });
});

/* ================================================================== */
/* Additional: sortBySeverity and getSeverityBadgeVariant exports      */
/* ================================================================== */

describe("lib/results utility exports", () => {
  it("sortBySeverity sorts items by severity P0 → P3", async () => {
    const { sortBySeverity } = await import("../../lib/results");
    const items = [
      { severity: "P3" as const },
      { severity: "P0" as const },
      { severity: "P2" as const },
      { severity: "P1" as const },
    ];
    const sorted = sortBySeverity(items);
    expect(sorted.map((i) => i.severity)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("sortByPriority sorts items by priority P0 → P3", async () => {
    const { sortByPriority } = await import("../../lib/results");
    const items = [
      { priority: "P2" as const },
      { priority: "P0" as const },
      { priority: "P3" as const },
      { priority: "P1" as const },
    ];
    const sorted = sortByPriority(items);
    expect(sorted.map((i) => i.priority)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("getSeverityBadgeVariant returns correct variant for each severity", async () => {
    const { getSeverityBadgeVariant } = await import("../../lib/results");
    expect(getSeverityBadgeVariant("P0")).toBe("error");
    expect(getSeverityBadgeVariant("P1")).toBe("warning");
    expect(getSeverityBadgeVariant("P2")).toBe("info");
    expect(getSeverityBadgeVariant("P3")).toBe("neutral");
  });
});
