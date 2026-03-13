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
