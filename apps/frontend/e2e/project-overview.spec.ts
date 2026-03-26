import { expect, test } from "@playwright/test";

test.describe("PERF-166 / PERF-167: Project overview page", () => {
  /**
   * E-PERF-167-001: Full project overview flow.
   * Dashboard → click "Review details" → verify bento grid loads.
   */
  test.fixme("E-PERF-167-001 — project overview loads with bento grid", async ({ page }) => {
    await page.goto("/projects/proj-abc");
    await expect(page.getByTestId("project-overview-content")).toBeVisible();
    await expect(page.getByTestId("bento-health")).toBeVisible();
    await expect(page.getByTestId("bento-trends")).toBeVisible();
    await expect(page.getByTestId("bento-audit-log")).toBeVisible();
    await expect(page.getByTestId("bento-endpoint")).toBeVisible();
  });

  /**
   * E-PERF-167-002: Run audit from endpoint registry.
   * Click "Run Audit" on URL row → verify /audit page with URL prefilled.
   */
  test.fixme("E-PERF-167-002 — run audit from endpoint registry", async ({ page }) => {
    await page.goto("/projects/proj-abc");
    await expect(page.getByTestId("endpoint-table")).toBeVisible();
    const runAuditButton = page.getByTestId("endpoint-run-audit").first();
    await runAuditButton.click();
    await expect(page).toHaveURL(/\/audit\?url=/);
  });

  /**
   * E-PERF-167-003: CrUX-unavailable project still loads.
   * Open low-traffic project → verify explanatory trend state.
   */
  test.fixme("E-PERF-167-003 — CrUX-unavailable project still loads", async ({ page }) => {
    await page.goto("/projects/proj-low-traffic");
    // Should show the no-CrUX message or empty trend state
    const noCrux = page.getByTestId("trend-chart-no-crux");
    const emptyChart = page.getByTestId("trend-chart-empty");
    const isNoCrux = await noCrux.isVisible().catch(() => false);
    const isEmpty = await emptyChart.isVisible().catch(() => false);
    expect(isNoCrux || isEmpty).toBeTruthy();
  });
});
