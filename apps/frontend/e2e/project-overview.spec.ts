import { expect, test } from "@playwright/test";

test.describe("PERF-166 / PERF-167: Project overview backend contract", () => {
  test.fixme("E-PERF-166-001 — project overview loads with health data", async ({ page }) => {
    await page.goto("/projects/proj-abc");
    await expect(page.getByTestId("project-health-card")).toBeVisible();
  });
});
