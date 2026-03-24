import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockPush = vi.fn();
const mockRouter = { push: mockPush };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockListProjects = vi.fn();
const mockCreateProject = vi.fn();
const mockGetProject = vi.fn();
const mockAddUrlToProject = vi.fn();
const mockDeleteUrl = vi.fn();
const mockGetLastAuditForProject = vi.fn();
const mockGetLatestAuditForUrl = vi.fn();
vi.mock("@/lib/projects", () => ({
  listProjects: (...args: unknown[]) => mockListProjects(...args),
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  getProject: (...args: unknown[]) => mockGetProject(...args),
  addUrlToProject: (...args: unknown[]) => mockAddUrlToProject(...args),
  deleteUrl: (...args: unknown[]) => mockDeleteUrl(...args),
  getLastAuditForProject: (...args: unknown[]) => mockGetLastAuditForProject(...args),
  getLatestAuditForUrl: (...args: unknown[]) => mockGetLatestAuditForUrl(...args),
  COPY_DASHBOARD_EMPTY: "Create your first project to start auditing your web performance.",
  COPY_URL_VALIDATION_ERROR: "Please enter a valid URL including https://",
  COPY_PROJECT_NAME_REQUIRED: "Project name is required.",
  COPY_PROJECT_NAME_TOO_LONG: "Project name must be 100 characters or fewer.",
  COPY_PROJECT_CREATED: "Project created successfully.",
  COPY_URL_ADDED: "URL added to project.",
  COPY_URL_DELETED: "URL removed from project.",
  COPY_PROJECT_LOAD_FAILED: "Failed to load projects. Please try again.",
  COPY_PROJECT_CREATE_FAILED: "Failed to create project. Please try again.",
}));

// Import after mocks
import DashboardPage from "../../app/(authenticated)/dashboard/page";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: health data returns unknown (no audits)
  mockGetLastAuditForProject.mockResolvedValue({
    lcp: "unknown",
    cls: "unknown",
    tbt: "unknown",
    lcpValue: null,
    clsValue: null,
    tbtValue: null,
    lastAuditId: null,
    lastAuditDate: null,
    firstUrl: null,
  });
  // Default: per-URL audit info returns no data
  mockGetLatestAuditForUrl.mockResolvedValue({ auditId: null, hasAuditData: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Test data factories                                                 */
/* ------------------------------------------------------------------ */

function makeProject(overrides: Partial<{ projectId: string; name: string }> = {}) {
  return {
    projectId: overrides.projectId ?? "proj-1",
    ownerId: "user-1",
    name: overrides.name ?? "My Project",
    createdAt: "2026-03-20T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z",
  };
}

function makeProjectList(items = [makeProject()]) {
  return { page: 1, size: 20, total: items.length, items };
}

function makeProjectDetail(urls: Array<{ urlId: string; url: string }> = []) {
  return {
    project: makeProject(),
    urls: urls.map((u) => ({
      ...u,
      projectId: "proj-1",
      normalizedUrl: `${u.url}/`,
      addedAt: "2026-03-20T00:00:00Z",
    })),
  };
}

/* ================================================================== */
/* P-PERF-125-001: Project list fetched and displayed                  */
/* ================================================================== */

describe("P-PERF-125-001: Project list fetched from GET /api/v1/projects", () => {
  it("fetches and displays project list on mount", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([
        makeProject({ projectId: "proj-1", name: "Project Alpha" }),
        makeProject({ projectId: "proj-2", name: "Project Beta" }),
      ])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-list")).toBeInTheDocument();
      expect(screen.getByTestId("project-name-proj-1")).toHaveTextContent("Project Alpha");
      expect(screen.getByTestId("project-name-proj-2")).toHaveTextContent("Project Beta");
    });
    expect(mockListProjects).toHaveBeenCalled();
  });
});

/* ================================================================== */
/* P-PERF-125-002: Create project with valid name                      */
/* ================================================================== */

describe("P-PERF-125-002: Create project form with Zod validation", () => {
  it("creates a project and refreshes the list on success", async () => {
    // Initial load: empty, then after create: has project
    // Use mockImplementation to handle multiple calls (React Strict Mode may double-call)
    mockListProjects.mockImplementation(() => {
      // After createProject is called, return the new list
      if (mockCreateProject.mock.calls.length > 0) {
        return Promise.resolve(
          makeProjectList([makeProject({ projectId: "proj-new", name: "New Project" })])
        );
      }
      return Promise.resolve(makeProjectList([]));
    });
    mockCreateProject.mockResolvedValue({
      projectId: "proj-new",
      name: "New Project",
      createdAt: "2026-03-20T00:00:00Z",
    });

    const user = userEvent.setup();
    render(<DashboardPage />);

    // Wait for empty state
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    });

    // Fill and submit
    await user.type(screen.getByTestId("create-project-input"), "New Project");
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledWith("New Project");
      expect(screen.getByTestId("project-list")).toBeInTheDocument();
    });
  });

  it("shows validation error for empty project name", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    });

    // Submit without typing
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(screen.getByText("Project name is required.")).toBeInTheDocument();
    });
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it("shows validation error for name exceeding 100 characters", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    });

    const longName = "A".repeat(101);
    await user.type(screen.getByTestId("create-project-input"), longName);
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(screen.getByText("Project name must be 100 characters or fewer.")).toBeInTheDocument();
    });
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* P-PERF-125-003: Project cards show name and status badge            */
/* ================================================================== */

describe("P-PERF-125-003: Project cards with name, URL count, status badge", () => {
  it("renders project cards with name and Active badge", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-name-proj-1")).toHaveTextContent("Test Site");
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* P-PERF-125-004: Add URL to project                                  */
/* ================================================================== */

describe("P-PERF-125-004: Add URL to project", () => {
  it("adds a URL to an expanded project", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));
    mockAddUrlToProject.mockResolvedValue({
      urlId: "url-new",
      url: "https://example.com",
      normalizedUrl: "https://example.com/",
      addedAt: "2026-03-20T00:00:00Z",
    });

    const user = userEvent.setup();
    render(<DashboardPage />);

    // Wait for project list
    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    // Expand project
    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("project-detail-proj-1")).toBeInTheDocument();
    });

    // Add URL
    await user.type(screen.getByTestId("add-url-input"), "https://example.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(mockAddUrlToProject).toHaveBeenCalledWith("proj-1", "https://example.com");
      expect(screen.getByTestId("url-item-url-new")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* P-PERF-125-005: Run Audit navigates to /audit?url=<encoded-url>     */
/* ================================================================== */

describe("P-PERF-125-005: Run Audit per URL navigates to /audit", () => {
  it("navigates to /audit with encoded URL when Run Audit is clicked", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://example.com" }])
    );

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("run-audit-url-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("run-audit-url-1"));

    expect(mockPush).toHaveBeenCalledWith("/audit?url=https%3A%2F%2Fexample.com");
  });
});

/* ================================================================== */
/* U-PERF-125-001: Loading state with skeleton cards                    */
/* ================================================================== */

describe("U-PERF-125-001: Loading state with skeleton cards", () => {
  it("shows skeleton loading state on initial render", () => {
    mockListProjects.mockReturnValue(new Promise(() => {})); // never resolves

    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-loading")).toHaveAttribute("role", "status");
  });
});

/* ================================================================== */
/* U-PERF-125-002: Empty state with CTA                                */
/* ================================================================== */

describe("U-PERF-125-002: Empty state with CTA when no projects exist", () => {
  it("shows empty state with helper text and create form", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
      expect(
        screen.getByText("Create your first project to start auditing your web performance.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("create-project-form")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* U-PERF-125-003: Error state with retry button                       */
/* ================================================================== */

describe("U-PERF-125-003: Error state with accessible alert and retry", () => {
  it("shows error alert with retry button when API fails", async () => {
    const err = new Error("Network error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_LIST_FAILED";
    mockListProjects.mockRejectedValue(err);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
      expect(screen.getByTestId("dashboard-retry")).toBeInTheDocument();
    });
  });

  it("retries fetching projects when retry button is clicked", async () => {
    const err = new Error("Network error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_LIST_FAILED";
    // Reject all initial calls, then resolve on retry
    mockListProjects.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
    });

    // Now switch to success for retry
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    await user.click(screen.getByTestId("dashboard-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("project-list")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* U-PERF-125-004: Success state with project grid                     */
/* ================================================================== */

describe("U-PERF-125-004: Success state renders project cards grid", () => {
  it("renders project cards in a grid layout", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([
        makeProject({ projectId: "proj-1", name: "Alpha" }),
        makeProject({ projectId: "proj-2", name: "Beta" }),
        makeProject({ projectId: "proj-3", name: "Gamma" }),
      ])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-list")).toBeInTheDocument();
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
      expect(screen.getByTestId("project-card-proj-2")).toBeInTheDocument();
      expect(screen.getByTestId("project-card-proj-3")).toBeInTheDocument();
    });
  });

  it("renders within MotionWrapper (animation container present)", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));

    render(<DashboardPage />);

    await waitFor(() => {
      const dashboardPage = screen.getByTestId("dashboard-page");
      expect(dashboardPage).toBeInTheDocument();
      expect(dashboardPage.parentElement).toBeTruthy();
    });
  });
});

/* ================================================================== */
/* T-PERF-125-001: GET /api/v1/projects returns paginated list         */
/* ================================================================== */

describe("T-PERF-125-001: GET /api/v1/projects returns paginated list", () => {
  it("calls listProjects on mount and renders items", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mockListProjects).toHaveBeenCalled();
      expect(screen.getByTestId("project-list")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-125-002: POST /api/v1/projects creates project               */
/* ================================================================== */

describe("T-PERF-125-002: POST /api/v1/projects creates project", () => {
  it("calls createProject with name and shows success toast", async () => {
    mockListProjects.mockImplementation(() => {
      if (mockCreateProject.mock.calls.length > 0) {
        return Promise.resolve(makeProjectList([makeProject({ name: "Created" })]));
      }
      return Promise.resolve(makeProjectList([]));
    });
    mockCreateProject.mockResolvedValue({
      projectId: "proj-created",
      name: "Created",
      createdAt: "2026-03-20T00:00:00Z",
    });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("create-project-input"), "Created");
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledWith("Created");
      expect(screen.getByText("Project created successfully.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-125-003: POST /api/v1/projects/:id/urls adds URL             */
/* ================================================================== */

describe("T-PERF-125-003: POST /api/v1/projects/:id/urls adds URL", () => {
  it("calls addUrlToProject and shows URL in list", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));
    mockAddUrlToProject.mockResolvedValue({
      urlId: "url-added",
      url: "https://test.com",
      normalizedUrl: "https://test.com/",
      addedAt: "2026-03-20T00:00:00Z",
    });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "https://test.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(mockAddUrlToProject).toHaveBeenCalledWith("proj-1", "https://test.com");
      expect(screen.getByText("URL added to project.")).toBeInTheDocument();
    });
  });

  it("shows validation error for non-https URL", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "http://insecure.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
    expect(mockAddUrlToProject).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* T-PERF-125-004: DELETE /api/v1/projects/:id/urls/:urlId             */
/* ================================================================== */

describe("T-PERF-125-004: DELETE URL removes it from the list", () => {
  it("calls deleteUrl and removes URL from display", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-del", url: "https://delete-me.com" }])
    );
    mockDeleteUrl.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("url-item-url-del")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-url-url-del"));

    await waitFor(() => {
      expect(mockDeleteUrl).toHaveBeenCalledWith("proj-1", "url-del");
      expect(screen.queryByTestId("url-item-url-del")).not.toBeInTheDocument();
      expect(screen.getByText("URL removed from project.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-125-005: Unauthenticated → 401 → redirect /login            */
/* ================================================================== */

describe("T-PERF-125-005: Unauthenticated request returns 401 → redirect to /login", () => {
  it("redirects to /login on 401 from listProjects", async () => {
    const err = new Error("Authentication required") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_NO_SESSION";
    mockListProjects.mockRejectedValue(err);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to /login on 401 from createProject", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    const err = new Error("Session expired") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_SESSION_INVALID";
    mockCreateProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("create-project-input"), "Test");
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to /login on 401 from getProject", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));

    const err = new Error("Session expired") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_SESSION_INVALID";
    mockGetProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to /login on 401 from addUrlToProject", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const err = new Error("Session expired") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_SESSION_INVALID";
    mockAddUrlToProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "https://example.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to /login on 401 from deleteUrl", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://example.com" }])
    );

    const err = new Error("Session expired") as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = "AUTH_SESSION_INVALID";
    mockDeleteUrl.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("delete-url-url-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-url-url-1"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});

/* ================================================================== */
/* P-PERF-144-001: Project cards show HealthDots component             */
/* ================================================================== */

describe("P-PERF-144-001: Project cards show HealthDots and audit status", () => {
  it("renders HealthDots with 'No audits yet' text on project cards", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
      // HealthDots shows "No audits yet" since all statuses are unknown
      const card = screen.getByTestId("project-card-proj-1");
      expect(card).toHaveTextContent("No audits yet");
    });
  });

  it("renders 'Run first audit' link on project cards", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("run-first-audit-proj-1")).toBeInTheDocument();
      expect(screen.getByTestId("run-first-audit-proj-1")).toHaveTextContent("Run first audit");
    });
  });

  it("navigates to /audit when 'Run first audit' is clicked", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("run-first-audit-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("run-first-audit-proj-1"));

    expect(mockPush).toHaveBeenCalledWith("/audit");
  });

  it("shows audit status section with data-testid", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-audit-status-proj-1")).toBeInTheDocument();
    });
  });

  it("renders health-dots testid on project cards", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("health-dots")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* E-DASH-001: Dashboard page renders (covered by unit tests)          */
/* ================================================================== */

describe("E-DASH-001: Dashboard page renders with heading", () => {
  it("renders dashboard heading", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* E-DASH-002: Dashboard page returns 200 (covered by E2E)             */
/* ================================================================== */

describe("E-DASH-002: Dashboard page structure", () => {
  it("renders main element with correct test id", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    render(<DashboardPage />);

    await waitFor(() => {
      const main = screen.getByTestId("dashboard-page");
      expect(main.tagName).toBe("MAIN");
    });
  });
});

/* ================================================================== */
/* E-DASH-003: Authenticated user sees project overview                */
/* ================================================================== */

describe("E-DASH-003: Authenticated user sees project overview", () => {
  it("displays project list with project cards for authenticated user", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([
        makeProject({ projectId: "proj-a", name: "Site A" }),
        makeProject({ projectId: "proj-b", name: "Site B" }),
      ])
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-list")).toBeInTheDocument();
      expect(screen.getByTestId("project-card-proj-a")).toBeInTheDocument();
      expect(screen.getByTestId("project-card-proj-b")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Create project error handling                           */
/* ================================================================== */

describe("Create project error handling", () => {
  it("shows error toast when createProject fails with non-401 error", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    const err = new Error("Server error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_CREATE_FAILED";
    mockCreateProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-project-input")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("create-project-input"), "Test");
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows fallback error message when createProject error has no message", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([]));

    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_CREATE_FAILED";
    mockCreateProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-project-input")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("create-project-input"), "Test");
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(screen.getByText("Failed to create project.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Project detail toggle                                   */
/* ================================================================== */

describe("Project detail toggle", () => {
  it("collapses project detail when clicking the same card again", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByTestId("project-card-proj-1"));
    await waitFor(() => {
      expect(screen.getByTestId("project-detail-proj-1")).toBeInTheDocument();
    });

    // Collapse
    await user.click(screen.getByTestId("project-card-proj-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("project-detail-proj-1")).not.toBeInTheDocument();
    });
  });

  it("shows no-URLs message when project has no URLs", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("project-no-urls")).toBeInTheDocument();
      expect(screen.getByText("Add a URL to start auditing your site.")).toBeInTheDocument();
    });
  });

  it("shows loading skeleton while fetching project detail", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockReturnValue(new Promise(() => {})); // never resolves

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("project-detail-loading")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: getProject error handling (non-401)                     */
/* ================================================================== */

describe("getProject error handling", () => {
  it("shows error toast when getProject fails with non-401 error", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));

    const err = new Error("Server error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_GET_FAILED";
    mockGetProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows fallback error message when getProject error has no message", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));

    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_GET_FAILED";
    mockGetProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByText("Failed to load project details.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Add URL error handling                                  */
/* ================================================================== */

describe("Add URL error handling", () => {
  it("shows field error on 400 from addUrlToProject", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const err = new Error("URL must be HTTPS") as Error & { status: number; code: string };
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    mockAddUrlToProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "https://server-rejects.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("URL must be HTTPS")).toBeInTheDocument();
    });
  });

  it("shows error toast on non-400/non-401 from addUrlToProject", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const err = new Error("Server error") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_URL_ADD_FAILED";
    mockAddUrlToProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "https://example.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows fallback error on 400 with empty message from addUrlToProject", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const err = new Error("") as Error & { status: number; code: string };
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    mockAddUrlToProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "https://example.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
  });

  it("shows fallback error toast on non-400/non-401 with empty message", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_URL_ADD_FAILED";
    mockAddUrlToProject.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "https://example.com");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("Failed to add URL.")).toBeInTheDocument();
    });
  });

  it("shows validation error for empty URL", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    // Submit without typing
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
    expect(mockAddUrlToProject).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid URL format", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("add-url-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-url-input"), "not-a-url");
    await user.click(screen.getByTestId("add-url-submit"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid URL including https://")).toBeInTheDocument();
    });
    expect(mockAddUrlToProject).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* Additional: Delete URL error handling                               */
/* ================================================================== */

describe("Delete URL error handling", () => {
  it("shows error toast when deleteUrl fails with non-401 error", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://example.com" }])
    );

    const err = new Error("Delete failed") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_URL_DELETE_FAILED";
    mockDeleteUrl.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("delete-url-url-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-url-url-1"));

    await waitFor(() => {
      expect(screen.getByText("Delete failed")).toBeInTheDocument();
    });
    // URL should still be in the list
    expect(screen.getByTestId("url-item-url-1")).toBeInTheDocument();
  });

  it("shows fallback error message when deleteUrl error has no message", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://example.com" }])
    );

    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_URL_DELETE_FAILED";
    mockDeleteUrl.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("delete-url-url-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-url-url-1"));

    await waitFor(() => {
      expect(screen.getByText("Failed to delete URL.")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Error state fallback message                            */
/* ================================================================== */

describe("Error state fallback message", () => {
  it("uses fallback error message when listProjects error has no message", async () => {
    const err = new Error("") as Error & { status: number; code: string };
    err.status = 500;
    err.code = "PROJECT_LIST_FAILED";
    mockListProjects.mockRejectedValue(err);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to load projects. Please try again."
      );
    });
  });
});

/* ================================================================== */
/* Additional: Toast dismiss                                           */
/* ================================================================== */

describe("Toast dismiss", () => {
  it("dismisses toast when dismiss button is clicked", async () => {
    mockListProjects.mockImplementation(() => {
      if (mockCreateProject.mock.calls.length > 0) {
        return Promise.resolve(makeProjectList([makeProject()]));
      }
      return Promise.resolve(makeProjectList([]));
    });
    mockCreateProject.mockResolvedValue({
      projectId: "proj-1",
      name: "Test",
      createdAt: "2026-03-20T00:00:00Z",
    });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-project-input")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("create-project-input"), "Test");
    await user.click(screen.getByTestId("create-project-submit"));

    await waitFor(() => {
      expect(screen.getByText("Project created successfully.")).toBeInTheDocument();
    });

    // Dismiss toast
    await user.click(screen.getByLabelText("Dismiss notification"));

    await waitFor(() => {
      expect(screen.queryByText("Project created successfully.")).not.toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Keyboard navigation on project cards                    */
/* ================================================================== */

describe("Keyboard navigation on project cards", () => {
  it("toggles project detail when Enter is pressed on a card", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    // Focus the card and press Enter
    screen.getByTestId("project-card-proj-1").focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("project-detail-proj-1")).toBeInTheDocument();
    });
  });

  it("toggles project detail when Space is pressed on a card", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(makeProjectDetail([]));

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    // Focus the card and press Space
    screen.getByTestId("project-card-proj-1").focus();
    await user.keyboard(" ");

    await waitFor(() => {
      expect(screen.getByTestId("project-detail-proj-1")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Project card shows firstUrl subtitle                    */
/* ================================================================== */

describe("Project card firstUrl subtitle", () => {
  it("shows firstUrl as subtitle when health data has a URL", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );
    mockGetLastAuditForProject.mockResolvedValue({
      lcp: "unknown",
      cls: "unknown",
      tbt: "unknown",
      lcpValue: null,
      clsValue: null,
      tbtValue: null,
      lastAuditId: null,
      lastAuditDate: null,
      firstUrl: "https://www.example.com",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("https://www.example.com")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Project card shows metric values from health data       */
/* ================================================================== */

describe("Project card metric values", () => {
  it("passes metric values to HealthDots when health data has values", async () => {
    mockListProjects.mockResolvedValue(
      makeProjectList([makeProject({ projectId: "proj-1", name: "Test Site" })])
    );
    mockGetLastAuditForProject.mockResolvedValue({
      lcp: "good",
      cls: "good",
      tbt: "good",
      lcpValue: "2.1s",
      clsValue: "0.05",
      tbtValue: "150ms",
      lastAuditId: "audit-123",
      lastAuditDate: "2026-03-24T00:00:00Z",
      firstUrl: "https://www.example.com",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("2.1s")).toBeInTheDocument();
      expect(screen.getByText("0.05")).toBeInTheDocument();
      expect(screen.getByText("150ms")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: View Results navigates to /results?id=<auditId>         */
/* ================================================================== */

describe("View Results per URL navigates to /results", () => {
  it("shows View Previous Results button when URL has audit data", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://www.example.com" }])
    );
    mockGetLatestAuditForUrl.mockResolvedValue({ auditId: "audit-123", hasAuditData: true });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("view-results-url-1")).toBeInTheDocument();
      expect(screen.getByTestId("view-results-url-1")).toHaveTextContent("View Previous Results");
    });
  });

  it("navigates to /results with audit ID when View Previous Results is clicked", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://www.example.com" }])
    );
    mockGetLatestAuditForUrl.mockResolvedValue({ auditId: "audit-123", hasAuditData: true });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("view-results-url-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("view-results-url-1"));

    expect(mockPush).toHaveBeenCalledWith("/results?id=audit-123");
  });

  it("does not show View Previous Results button when URL has no audit data", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://example.com" }])
    );
    mockGetLatestAuditForUrl.mockResolvedValue({ auditId: null, hasAuditData: false });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("url-item-url-1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("view-results-url-1")).not.toBeInTheDocument();
  });

  it("falls back to /audit?url= when URL has audit data but no auditId", async () => {
    mockListProjects.mockResolvedValue(makeProjectList([makeProject()]));
    mockGetProject.mockResolvedValue(
      makeProjectDetail([{ urlId: "url-1", url: "https://www.example.com" }])
    );
    mockGetLatestAuditForUrl.mockResolvedValue({ auditId: null, hasAuditData: true });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-card-proj-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("project-card-proj-1"));

    await waitFor(() => {
      expect(screen.getByTestId("view-results-url-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("view-results-url-1"));

    expect(mockPush).toHaveBeenCalledWith("/audit?url=https%3A%2F%2Fwww.example.com");
  });
});
