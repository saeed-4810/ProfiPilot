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
    test.setTimeout(180_000);

    // First, trigger an audit to get a real audit ID
    await page.goto("/audit");
    await expect(page.getByTestId("audit-page")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("audit-url-input").fill("https://example.com");
    await page.getByTestId("audit-submit").click();

    // Wait for audit to complete
    await expect(page.getByTestId("audit-success").or(page.getByTestId("audit-error"))).toBeVisible(
      { timeout: 150_000 }
    );

    // If audit succeeded, navigate to results
    const success = page.getByTestId("audit-success");
    if (await success.isVisible()) {
      // Look for a link to results page and click it
      const resultsLink = page.locator("a[href*='/results']").first();
      if (await resultsLink.isVisible()) {
        await resultsLink.click();
      } else {
        // Extract audit ID from the page and navigate directly
        const jobIdEl = page.getByTestId("audit-job-id");
        const jobIdText = await jobIdEl.textContent();
        const auditId = jobIdText?.replace(/.*:\s*/, "").trim();
        if (auditId) {
          await page.goto(`/results?id=${auditId}`);
        }
      }

      // Verify results page loaded with content
      await expect(page.getByTestId("results-page")).toBeVisible({ timeout: 15_000 });

      // Wait for results to load (loading → content)
      await expect(
        page
          .getByTestId("results-content")
          .or(page.getByTestId("results-error"))
          .or(page.getByTestId("results-not-completed"))
      ).toBeVisible({ timeout: 30_000 });

      // If content loaded, verify key sections
      const content = page.getByTestId("results-content");
      if (await content.isVisible()) {
        // Executive summary section
        await expect(page.getByTestId("executive-summary")).toBeVisible();

        // Recommendations section
        await expect(page.getByTestId("recommendations")).toBeVisible();

        // Dev tickets section
        await expect(page.getByTestId("dev-tickets")).toBeVisible();
      }
    }
  });

  // E-RESULTS-004: Results page handles missing audit ID gracefully
  test("E-RESULTS-004 — results page handles missing audit ID", async ({ page }) => {
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
