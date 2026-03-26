import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Increase default waitFor timeout for async component tests
configure({ asyncUtilTimeout: 3000 });

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockPush = vi.fn();
const mockParams = { id: "proj-abc" };

vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/analytics", () => ({
  trackPageView: vi.fn(),
}));

vi.mock("@/components/MotionWrapper", () => ({
  MotionWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/* Mock API modules */
const mockGetProject = vi.fn();
const mockGetProjectHealth = vi.fn();
const mockGetProjectAudits = vi.fn();
const mockGetProjectTrends = vi.fn();

vi.mock("@/lib/projects", () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

vi.mock("@/lib/project-detail", () => ({
  getProjectHealth: (...args: unknown[]) => mockGetProjectHealth(...args),
  getProjectAudits: (...args: unknown[]) => mockGetProjectAudits(...args),
  getProjectTrends: (...args: unknown[]) => mockGetProjectTrends(...args),
  classifyScore: (score: number | null) => {
    if (score === null) return "neutral";
    if (score >= 90) return "success";
    if (score >= 50) return "warning";
    return "error";
  },
  formatDelta: (delta: number | null) => {
    if (delta === null || delta === 0) return { text: "\u2014", direction: "neutral" };
    if (delta > 0) return { text: `+${delta.toFixed(1)}%`, direction: "up" };
    return { text: `${delta.toFixed(1)}%`, direction: "down" };
  },
  COPY_PROJECT_DETAIL_ERROR: "Failed to load project data. Please try again.",
  COPY_HEALTH_HEADING: "Overall Project Health",
  COPY_TRENDS_HEADING: "30-Day Performance Trends",
  COPY_AUDIT_LOG_HEADING: "Audit Log",
  COPY_ENDPOINT_HEADING: "Endpoint Registry",
  COPY_START_AUDIT: "Start New Project Audit",
  COPY_VIEW_REPORT: "View Report",
  COPY_RUN_AUDIT: "Run Audit",
  COPY_NO_AUDITS: "No audits yet. Run your first audit to see results here.",
  COPY_NO_URLS: "No URLs added yet. Add a URL to start tracking performance.",
  COPY_NO_CRUX:
    "This site doesn't have enough real-user traffic for field data trends. Run audits regularly for lab data trends.",
  COPY_FIELD_LEGEND: "Field data (real users)",
  COPY_LAB_LEGEND: "Lab data (Lighthouse)",
  COPY_PROJECT_NOT_FOUND: "Project not found.",
}));

// Import AFTER mocks are set up
import ProjectOverviewPage from "../../app/(authenticated)/projects/[id]/page";

/* ------------------------------------------------------------------ */
/* Test data                                                           */
/* ------------------------------------------------------------------ */

const MOCK_PROJECT = {
  project: {
    projectId: "proj-abc",
    ownerId: "user-1",
    name: "Acme Store",
    urlCount: 2,
    healthStatus: "warning" as const,
    createdAt: "2026-03-20T00:00:00Z",
    updatedAt: "2026-03-25T00:00:00Z",
  },
  urls: [],
};

const MOCK_HEALTH = {
  projectId: "proj-abc",
  overallScore: 72,
  scoreDelta: 4.2,
  deltaLabel: "+4.2% since last week",
  urlScores: [
    {
      urlId: "u1",
      url: "https://acme.com",
      label: "Home Page",
      score: 82,
      lastAuditDate: "2026-03-25T10:00:00Z",
    },
    {
      urlId: "u2",
      url: "https://acme.com/shop",
      label: "Category: Apparel",
      score: 58,
      lastAuditDate: "2026-03-24T10:00:00Z",
    },
  ],
  inProgressCount: 0,
  attentionCount: 0,
  computedAt: "2026-03-25T12:00:00Z",
};

const MOCK_AUDITS = {
  page: 1,
  size: 20,
  total: 2,
  items: [
    {
      jobId: "audit-2049",
      url: "https://acme.com",
      performanceScore: 85,
      status: "completed",
      createdAt: "2026-03-25T14:00:00Z",
    },
    {
      jobId: "audit-2031",
      url: "https://acme.com/shop",
      performanceScore: 45,
      status: "completed",
      createdAt: "2026-03-24T08:00:00Z",
    },
  ],
};

const MOCK_TRENDS = {
  projectId: "proj-abc",
  cruxAvailable: true,
  cruxPeriods: [
    { startDate: "2026-02-23", endDate: "2026-03-01", lcpP75: 2500, clsP75: 0.1, inpP75: 200 },
    { startDate: "2026-03-02", endDate: "2026-03-08", lcpP75: 2400, clsP75: 0.09, inpP75: 180 },
  ],
  labDataPoints: [
    { date: "2026-03-25T10:00:00Z", lcp: 2400, cls: 0.08, tbt: 150, performanceScore: 0.85 },
  ],
};

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProject.mockResolvedValue(MOCK_PROJECT);
  mockGetProjectHealth.mockResolvedValue(MOCK_HEALTH);
  mockGetProjectAudits.mockResolvedValue(MOCK_AUDITS);
  mockGetProjectTrends.mockResolvedValue(MOCK_TRENDS);
});

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-005: Loading skeletons                                   */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-005: Loading skeletons", () => {
  it("shows loading skeletons for all 4 sections while data loads", () => {
    mockGetProject.mockReturnValue(new Promise(() => {}));
    mockGetProjectHealth.mockReturnValue(new Promise(() => {}));
    mockGetProjectAudits.mockReturnValue(new Promise(() => {}));
    mockGetProjectTrends.mockReturnValue(new Promise(() => {}));

    render(<ProjectOverviewPage />);

    expect(screen.getByTestId("project-overview-loading")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-health")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-trends")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-audit-log")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-endpoint")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* P-PERF-167-001: Health at a glance                                  */
/* ------------------------------------------------------------------ */

describe("P-PERF-167-001: Project overview shows health at a glance", () => {
  it("renders health score, trend delta, and URL breakdown", async () => {
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("health-score")).toHaveTextContent("72");
      expect(screen.getByTestId("health-delta")).toHaveTextContent("+4.2%");
      expect(screen.getByTestId("bento-health")).toBeInTheDocument();
      expect(screen.getByTestId("bento-trends")).toBeInTheDocument();
      expect(screen.getByTestId("bento-audit-log")).toBeInTheDocument();
      expect(screen.getByTestId("bento-endpoint")).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/* U-PERF-167-001: Bento grid layout                                   */
/* ------------------------------------------------------------------ */

describe("U-PERF-167-001: Bento grid layout", () => {
  it("renders 4 sections in responsive grid", async () => {
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      const content = screen.getByTestId("project-overview-content");
      expect(content.className).toContain("grid");
      expect(content.className).toContain("md:grid-cols-12");
    });
  });
});

/* ------------------------------------------------------------------ */
/* U-PERF-167-005: Breadcrumb navigation                               */
/* ------------------------------------------------------------------ */

describe("U-PERF-167-005: Breadcrumb navigation", () => {
  it("renders breadcrumb with Dashboard link and project name", async () => {
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("breadcrumb-dashboard")).toHaveTextContent("Dashboard");
      expect(screen.getByTestId("breadcrumb-dashboard")).toHaveAttribute("href", "/dashboard");
      expect(screen.getByTestId("breadcrumb-project")).toHaveTextContent("Acme Store");
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-001: Health card renders with real data                   */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-001: Health card renders with real data", () => {
  it("displays score and delta from health API", async () => {
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("health-card-content")).toBeInTheDocument();
      expect(screen.getByTestId("health-score")).toHaveTextContent("72");
      expect(screen.getByTestId("health-delta")).toBeInTheDocument();
    });
  });

  it("shows negative delta with down arrow", async () => {
    mockGetProjectHealth.mockResolvedValue({
      ...MOCK_HEALTH,
      scoreDelta: -2.1,
      deltaLabel: "-2.1% since last week",
    });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("health-delta")).toHaveTextContent("-2.1%");
    });
  });

  it("shows neutral delta when zero", async () => {
    mockGetProjectHealth.mockResolvedValue({ ...MOCK_HEALTH, scoreDelta: 0, deltaLabel: "" });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("health-delta")).toHaveTextContent("—");
    });
  });

  it("shows no-data message when overallScore is null", async () => {
    mockGetProjectHealth.mockResolvedValue({
      ...MOCK_HEALTH,
      overallScore: null,
      scoreDelta: null,
      deltaLabel: "",
    });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("health-no-data")).toBeInTheDocument();
      expect(screen.getByTestId("health-no-data")).toHaveTextContent("No audits yet");
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-003: Audit log renders timeline items                    */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-003: Audit log renders timeline items", () => {
  it("renders audit timeline with score badges", async () => {
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-log-timeline")).toBeInTheDocument();
      expect(screen.getAllByTestId("audit-view-report")).toHaveLength(2);
    });
  });

  it("renders all score color variants in timeline dots", async () => {
    mockGetProjectAudits.mockResolvedValue({
      page: 1,
      size: 20,
      total: 4,
      items: [
        {
          jobId: "a1",
          url: "https://a.com",
          performanceScore: 95,
          status: "completed",
          createdAt: "2026-03-25T14:00:00Z",
        },
        {
          jobId: "a2",
          url: "https://b.com",
          performanceScore: 72,
          status: "completed",
          createdAt: "2026-03-24T14:00:00Z",
        },
        {
          jobId: "a3",
          url: "https://c.com",
          performanceScore: 30,
          status: "completed",
          createdAt: "2026-03-23T14:00:00Z",
        },
        {
          jobId: "a4",
          url: "https://d.com",
          performanceScore: null,
          status: "failed",
          createdAt: "2026-03-22T14:00:00Z",
        },
      ],
    });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId("audit-view-report")).toHaveLength(4);
    });
  });

  it("shows empty state when no audits", async () => {
    mockGetProjectAudits.mockResolvedValue({ page: 1, size: 20, total: 0, items: [] });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-log-empty")).toHaveTextContent("No audits yet");
    });
  });
});

/* ------------------------------------------------------------------ */
/* T-PERF-167-004: Endpoint registry renders table rows                */
/* ------------------------------------------------------------------ */

describe("T-PERF-167-004: Endpoint registry renders table rows", () => {
  it("renders URL rows with performance bars and Run Audit buttons", async () => {
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId("endpoint-row")).toHaveLength(2);
      expect(screen.getAllByTestId("endpoint-run-audit")).toHaveLength(2);
    });
  });

  it("shows empty state when no URLs", async () => {
    mockGetProjectHealth.mockResolvedValue({ ...MOCK_HEALTH, urlScores: [] });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("endpoint-empty")).toHaveTextContent("No URLs added yet");
    });
  });

  it("renders all score color variants (success, warning, error, neutral)", async () => {
    mockGetProjectHealth.mockResolvedValue({
      ...MOCK_HEALTH,
      urlScores: [
        {
          urlId: "u1",
          url: "https://a.com",
          label: "Good",
          score: 95,
          lastAuditDate: "2026-03-25",
        },
        {
          urlId: "u2",
          url: "https://b.com",
          label: "Warn",
          score: 72,
          lastAuditDate: "2026-03-25",
        },
        { urlId: "u3", url: "https://c.com", label: "Bad", score: 30, lastAuditDate: "2026-03-25" },
        { urlId: "u4", url: "https://d.com", label: "None", score: null, lastAuditDate: null },
      ],
    });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId("endpoint-row")).toHaveLength(4);
    });
  });
});

/* ------------------------------------------------------------------ */
/* P-PERF-167-004: View Report navigation                              */
/* ------------------------------------------------------------------ */

describe("P-PERF-167-004: Audit history provides quick access to reports", () => {
  it("View Report navigates to /results?id={jobId}", async () => {
    const user = userEvent.setup();
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-log-timeline")).toBeInTheDocument();
      expect(screen.getAllByTestId("audit-view-report").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("audit-view-report")[0]!);
    expect(mockPush).toHaveBeenCalledWith("/results?id=audit-2049");
  });
});

/* ------------------------------------------------------------------ */
/* P-PERF-167-005: Run Audit navigation                                */
/* ------------------------------------------------------------------ */

describe("P-PERF-167-005: Endpoint registry enables targeted audits", () => {
  it("Run Audit navigates to /audit?url={url}", async () => {
    const user = userEvent.setup();
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("endpoint-table")).toBeInTheDocument();
      expect(screen.getAllByTestId("endpoint-run-audit").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("endpoint-run-audit")[0]!);
    expect(mockPush).toHaveBeenCalledWith("/audit?url=https%3A%2F%2Facme.com");
  });
});

/* ------------------------------------------------------------------ */
/* AC3: Start New Project Audit CTA                                    */
/* ------------------------------------------------------------------ */

describe("AC3: Start New Project Audit CTA", () => {
  it("CTA button routes to /audit", async () => {
    const user = userEvent.setup();
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("start-audit-cta")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("start-audit-cta"));
    expect(mockPush).toHaveBeenCalledWith("/audit");
  });
});

/* ------------------------------------------------------------------ */
/* Error state                                                         */
/* ------------------------------------------------------------------ */

describe("Error state", () => {
  it("shows error state with retry button on API failure", async () => {
    mockGetProject.mockRejectedValue(new Error("Network error"));
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("project-overview-error")).toHaveTextContent(
        "Failed to load project data"
      );
    });
  });

  it("retry button re-fetches data", async () => {
    mockGetProject.mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("project-overview-error")).toBeInTheDocument();
    });
    mockGetProject.mockResolvedValue(MOCK_PROJECT);
    const retryButton = screen.getByTestId("project-overview-error").querySelector("button");
    expect(retryButton).not.toBeNull();
    await user.click(retryButton!);
    await waitFor(() => {
      expect(screen.getByTestId("project-overview-content")).toBeInTheDocument();
    });
  });

  it("redirects to dashboard on 404", async () => {
    const error = new Error("Not found") as Error & { status: number };
    error.status = 404;
    mockGetProject.mockRejectedValue(error);
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});

/* ------------------------------------------------------------------ */
/* AC15: Analytics                                                     */
/* ------------------------------------------------------------------ */

describe("AC15: Analytics trackPageView on mount", () => {
  it("calls trackPageView with project route", async () => {
    const { trackPageView } = await import("../../lib/analytics");
    render(<ProjectOverviewPage />);
    expect(trackPageView).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/projects/proj-abc" })
    );
  });
});

/* ------------------------------------------------------------------ */
/* AC8: Project sidebar                                                */
/* ------------------------------------------------------------------ */

describe("AC8: Project-scoped sidebar", () => {
  it("renders project sidebar", () => {
    render(<ProjectOverviewPage />);
    expect(screen.getByTestId("project-sidebar")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* U-PERF-167-004: Empty project guides user                           */
/* ------------------------------------------------------------------ */

describe("U-PERF-167-004: Empty project guides user to first action", () => {
  it("shows CTA when no audits and no URLs", async () => {
    mockGetProjectHealth.mockResolvedValue({
      ...MOCK_HEALTH,
      overallScore: null,
      scoreDelta: null,
      deltaLabel: "",
      urlScores: [],
    });
    mockGetProjectAudits.mockResolvedValue({ page: 1, size: 20, total: 0, items: [] });
    render(<ProjectOverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId("health-no-data")).toBeInTheDocument();
      expect(screen.getByTestId("audit-log-empty")).toBeInTheDocument();
      expect(screen.getByTestId("endpoint-empty")).toBeInTheDocument();
    });
  });
});
