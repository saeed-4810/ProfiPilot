import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the AI Results flow (PERF-101).
 *
 * Shell tests (E-RESULTS-001, E-RESULTS-002) run now against the scaffold.
 * Feature tests (E-RESULTS-003) are stubs — implement when PERF-101 is in progress.
 */

test.describe("Results flow — /results", () => {
  // E-RESULTS-001: Results page renders without errors
  test("E-RESULTS-001 — results page renders with heading", async ({ page }) => {
    await page.goto("/results");
    await expect(page).toHaveTitle(/PrefPilot/);
    await expect(page.getByTestId("results-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Results/i })).toBeVisible();
  });

  // E-RESULTS-002: Results page returns 200 (no 404/500)
  test("E-RESULTS-002 — results page returns 200", async ({ page }) => {
    const response = await page.goto("/results");
    expect(response?.status()).toBe(200);
  });

  // E-RESULTS-003: User sees AI-generated preference insights after audit
  test.fixme("E-RESULTS-003 — AI insights are displayed after audit completion (PERF-101)", async ({
    page,
  }) => {
    await page.goto("/results");
    // TODO(PERF-101): assert insights panel and recommendation cards are rendered
    await expect(page.getByTestId("insights-panel")).toBeVisible();
  });
});
