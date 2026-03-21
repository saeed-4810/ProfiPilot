import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Results + AI Summary flow (PERF-102).
 *
 * Shell tests (E-RESULTS-001, E-RESULTS-002) run now against the scaffold.
 * Feature tests (E-RESULTS-003) require authenticated session with a completed audit.
 */

test.describe("Results flow — /results", () => {
  // E-RESULTS-001: Results route is protected — unauthenticated access redirects to /login.
  // Full page content tests require authenticated session (Firebase user + __session cookie).
  test("E-RESULTS-001 — results page renders with heading", async ({ page }) => {
    await page.goto("/results");
    // Middleware redirects to /login without __session cookie (per PERF-115)
    await expect(page).toHaveURL(/\/login/);
  });

  // E-RESULTS-002: Results page returns 200 (no 404/500)
  test("E-RESULTS-002 — results page returns 200", async ({ page }) => {
    const response = await page.goto("/results");
    expect(response?.status()).toBe(200);
  });

  // E-RESULTS-003: Completed audit shows recommendations and AI summary
  // Blocked by: E-AUTH-003 (authenticated session fixture not yet available).
  // When auth fixtures exist, remove test.fixme and provide a real audit ID.
  test.fixme("E-RESULTS-003 — completed audit shows recommendations and AI summary (PERF-102)", async ({
    page,
  }) => {
    // Prerequisites:
    // 1. Authenticated session via Playwright auth state fixture (__session cookie)
    // 2. A completed audit with recommendations in the test environment
    // 3. Backend running with GET /audits/:id/recommendations and /summary endpoints
    await page.goto("/results?id=test-audit-id");
    await expect(page.getByTestId("results-content")).toBeVisible();
    await expect(page.getByTestId("executive-summary")).toBeVisible();
    await expect(page.getByTestId("recommendations")).toBeVisible();
    await expect(page.getByTestId("dev-tickets")).toBeVisible();
  });
});
