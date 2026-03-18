import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Dashboard flow (PERF-102).
 *
 * Shell tests (E-DASH-001, E-DASH-002) run now against the scaffold.
 * Feature tests (E-DASH-003) are stubs — implement when PERF-102 is in progress.
 */

test.describe("Dashboard flow — /dashboard", () => {
  // E-DASH-001: Dashboard page renders without errors
  test("E-DASH-001 — dashboard page renders with heading", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveTitle(/PrefPilot/);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible();
  });

  // E-DASH-002: Dashboard page returns 200 (no 404/500)
  test("E-DASH-002 — dashboard page returns 200", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
  });

  // E-DASH-003: Authenticated user sees their project list
  test.fixme("E-DASH-003 — authenticated user sees project overview (PERF-102)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // TODO(PERF-102): assert project list is rendered for a logged-in user
    await expect(page.getByTestId("project-list")).toBeVisible();
  });
});

/**
 * E2E scenarios for the Project + URL CRUD flow (PERF-116).
 *
 * These are test.fixme stubs — activate when the frontend project
 * creation and URL management UI is implemented.
 * Backend API contracts verified in apps/backend/tests/project.test.ts.
 */
test.describe("Project + URL CRUD flow — PERF-116", () => {
  // E-PROJ-001: Project creation flow renders and submits
  test.fixme("E-PROJ-001 — project creation form visible, submit creates project, redirects to detail", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // TODO(PERF-116 frontend): click "Create project" CTA, fill name, submit
    await expect(page.getByTestId("create-project-form")).toBeVisible();
    await page.getByTestId("project-name-input").fill("My Test Project");
    await page.getByTestId("create-project-submit").click();
    // Expect redirect to project detail page
    await expect(page).toHaveURL(/\/projects\//);
  });

  // E-PROJ-002: URL addition flow validates and saves
  test.fixme("E-PROJ-002 — URL input validates format, submit stores URL, list updates", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // TODO(PERF-116 frontend): navigate to a project, add URL
    await expect(page.getByTestId("add-url-input")).toBeVisible();
    await page.getByTestId("add-url-input").fill("https://example.com");
    await page.getByTestId("add-url-submit").click();
    // Expect URL appears in the list
    await expect(page.getByText("https://example.com")).toBeVisible();
  });
});
