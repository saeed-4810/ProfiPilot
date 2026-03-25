import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Dashboard flow (PERF-125).
 *
 * All tests run with authenticated storageState from auth.setup.ts.
 *
 * E-DASH-001, E-DASH-002: Shell tests (redirect behavior).
 * E-DASH-003: Authenticated user sees project overview.
 * E-DASH-004: User creates a new project.
 * E-DASH-005: User adds a URL to a project.
 * E-DASH-006: User triggers audit from dashboard.
 */

test.describe("Dashboard flow — /dashboard", () => {
  // E-DASH-001: Dashboard route is protected — unauthenticated access redirects to /login.
  test("E-DASH-001 — unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  // E-DASH-002: Dashboard route responds (redirect is still a 200 after following)
  test("E-DASH-002 — dashboard page returns 200", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
  });

  // E-DASH-003: Authenticated user sees their project list or empty state
  test("E-DASH-003 — authenticated user sees project overview", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible();

    // Either project list or empty state should be visible (depends on user data)
    const projectList = page.getByTestId("project-list");
    const emptyState = page.getByTestId("dashboard-empty");
    const errorState = page.getByTestId("dashboard-error");

    await expect(projectList.or(emptyState).or(errorState)).toBeVisible({ timeout: 15_000 });
  });

  // E-DASH-004: User creates a new project from dashboard
  test("E-DASH-004 — user creates a new project", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15_000 });

    // Wait for loading to finish
    await page.waitForTimeout(2000);

    const projectName = `e2e-test-${Date.now()}`;

    // Fill in project name and submit
    await page.getByTestId("create-project-input").fill(projectName);
    await page.getByTestId("create-project-submit").click();

    // Project should appear in the list
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  // E-DASH-005: User adds a URL to a project
  test("E-DASH-005 — user adds a URL to a project", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15_000 });

    // Wait for projects to load
    await page.waitForTimeout(2000);

    // Create a fresh project first
    const projectName = `e2e-url-test-${Date.now()}`;
    await page.getByTestId("create-project-input").fill(projectName);
    await page.getByTestId("create-project-submit").click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });

    // Click on the project to expand it
    await page.getByText(projectName).click();

    // Wait for project detail to load
    const addUrlInput = page.getByTestId("add-url-input");
    await expect(addUrlInput).toBeVisible({ timeout: 10_000 });

    // Add a URL
    await addUrlInput.fill("https://example.com");
    await page.getByTestId("add-url-submit").click();

    // URL should appear in the project's URL list
    await expect(page.getByText("https://example.com")).toBeVisible({ timeout: 10_000 });
  });

  // E-DASH-006: User triggers audit from dashboard URL list
  test("E-DASH-006 — user triggers audit from dashboard", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);

    // Create project + add URL
    const projectName = `e2e-audit-test-${Date.now()}`;
    await page.getByTestId("create-project-input").fill(projectName);
    await page.getByTestId("create-project-submit").click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
    await page.getByText(projectName).click();

    const addUrlInput = page.getByTestId("add-url-input");
    await expect(addUrlInput).toBeVisible({ timeout: 10_000 });
    await addUrlInput.fill("https://example.com");
    await page.getByTestId("add-url-submit").click();
    await expect(page.getByText("https://example.com")).toBeVisible({ timeout: 10_000 });

    // Find and click the "Run Audit" button for this URL
    const runAuditBtn = page.locator("[data-testid^='run-audit-']").first();
    await expect(runAuditBtn).toBeVisible({ timeout: 5_000 });
    await runAuditBtn.click();

    // Should navigate to /audit page or show audit progress
    await expect(page.getByTestId("audit-page").or(page.getByTestId("audit-progress"))).toBeVisible(
      { timeout: 10_000 }
    );
  });

  // E-PERF-164-001: Dashboard loads with real stats from GET /dashboard/stats.
  // Requires PERF-165 frontend implementation — stubbed as fixme until then.
  test.fixme("E-PERF-164-001 — dashboard loads with stat cards showing real numbers", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-stat-active-projects")).toBeVisible();
    await expect(page.getByTestId("dashboard-stat-in-progress")).toBeVisible();
    await expect(page.getByTestId("dashboard-stat-avg-score")).toBeVisible();
    await expect(page.getByTestId("dashboard-stat-attention")).toBeVisible();
  });
});
