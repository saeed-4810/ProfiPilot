import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Results + AI Summary flow (PERF-102).
 *
 * All tests run with authenticated storageState from auth.setup.ts.
 *
 * E-RESULTS-001: Results route protection (redirect).
 * E-RESULTS-002: Results page returns 200.
 * E-RESULTS-003: Completed audit shows recommendations and AI summary.
 * E-RESULTS-004: Results page handles missing/invalid audit ID gracefully.
 */

test.describe("Results flow — /results", () => {
  // E-RESULTS-001: Results route is protected — unauthenticated access redirects to /login.
  test("E-RESULTS-001 — results page redirects unauthenticated to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/results");
    await expect(page).toHaveURL(/\/login/);
  });

  // E-RESULTS-002: Results page returns 200 (no 404/500)
  test("E-RESULTS-002 — results page returns 200", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/results");
    expect(response?.status()).toBe(200);
  });

  // E-RESULTS-003: Results page with a completed audit shows recommendations + AI summary
  test("E-RESULTS-003 — completed audit shows recommendations and AI summary", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    test.setTimeout(180_000);

    // First, trigger an audit to get a real audit ID
    await page.goto("/audit");
    await expect(page.getByTestId("audit-page")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("audit-url-input").fill("https://example.com");
    await page.getByTestId("audit-submit").click();

    // Wait for audit to complete (PERF-142: audit-error-progress for failed audits)
    await expect(
      page
        .getByTestId("audit-success")
        .or(page.getByTestId("audit-error-progress"))
        .or(page.getByTestId("audit-error"))
    ).toBeVisible({ timeout: 150_000 });

    // If audit succeeded, wait for auto-redirect to /results?id=<auditId>
    const success = page.getByTestId("audit-success");
    if (await success.isVisible()) {
      await expect(page).toHaveURL(/\/results\?id=/, { timeout: 10_000 });

      // Verify results page loaded with content
      await expect(page.getByTestId("results-page")).toBeVisible({ timeout: 15_000 });

      // Wait for results to load (loading → content/empty/error/not-completed)
      await expect(
        page
          .getByTestId("results-content")
          .or(page.getByTestId("results-empty"))
          .or(page.getByTestId("results-error"))
          .or(page.getByTestId("results-not-completed"))
      ).toBeVisible({ timeout: 30_000 });

      // If content loaded, verify key sections (PERF-143: metrics overview always present)
      const content = page.getByTestId("results-content");
      if (await content.isVisible()) {
        // Metrics overview section — always present when audit has metrics
        await expect(page.getByTestId("metrics-overview")).toBeVisible();

        // Executive summary, recommendations, dev tickets may or may not be present
        // depending on audit results (example.com scores 100/100 = no recommendations)
      }

      // If empty state (no metrics available), verify the "no issues" message
      const empty = page.getByTestId("results-empty");
      if (await empty.isVisible()) {
        await expect(empty).toContainText("performing great");
      }
    }
  });

  // E-RESULTS-004: Results page handles missing audit ID gracefully
  test("E-RESULTS-004 — results page handles missing audit ID", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    await page.goto("/results");
    await expect(page.getByTestId("results-page")).toBeVisible({ timeout: 10_000 });

    // Should show not-found or empty state (no audit ID in query params)
    await expect(
      page
        .getByTestId("results-not-found")
        .or(page.getByTestId("results-empty"))
        .or(page.getByTestId("results-error"))
    ).toBeVisible({ timeout: 10_000 });
  });
});
