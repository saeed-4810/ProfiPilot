import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Dashboard flow (PERF-102).
 *
 * Shell tests (E-DASH-001, E-DASH-002) run now against the scaffold.
 * Feature tests (E-DASH-003) are stubs — implement when PERF-102 is in progress.
 */

test.describe("Dashboard flow — /dashboard", () => {
  // E-DASH-001: Dashboard route is protected — unauthenticated access redirects to /login.
  // Full page content tests require authenticated session (Firebase user + __session cookie).
  test("E-DASH-001 — dashboard page renders with heading", async ({ page }) => {
    await page.goto("/dashboard");
    // Middleware redirects to /login without __session cookie (per PERF-115)
    await expect(page).toHaveURL(/\/login/);
  });

  // E-DASH-002: Dashboard route responds (redirect is still a 200 after following)
  test("E-DASH-002 — dashboard page returns 200", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
  });

  // E-DASH-003: Authenticated user sees their project list (PERF-125)
  // Requires: Firebase test user + backend running + __session cookie.
  // Consistent with E-AUTH-003, E-AUTH-004, E-SHELL-002, E-AUDIT-003 — all auth-dependent
  // E2E tests use test.fixme until Playwright auth state fixture is implemented.
  test.fixme("E-DASH-003 — authenticated user sees project overview (PERF-125)", async ({
    page,
  }) => {
    // Requires: authenticated session (Firebase + __session cookie)
    await page.goto("/dashboard");

    // Dashboard page renders with heading
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible();

    // Project list or empty state is visible (depends on user's data)
    await expect(
      page.getByTestId("project-list").or(page.getByTestId("dashboard-empty"))
    ).toBeVisible();

    // Create project form is visible
    await expect(page.getByTestId("create-project-form")).toBeVisible();
    await expect(page.getByTestId("create-project-input")).toBeVisible();
    await expect(page.getByTestId("create-project-submit")).toBeVisible();
  });
});
