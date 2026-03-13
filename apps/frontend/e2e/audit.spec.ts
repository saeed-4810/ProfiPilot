import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Preference Audit flow (PERF-100).
 *
 * Shell tests (E-AUDIT-001, E-AUDIT-002) run now against the scaffold.
 * Feature tests (E-AUDIT-003) are stubs — implement when PERF-100 is in progress.
 */

test.describe("Audit flow — /audit", () => {
  // E-AUDIT-001: Audit page renders without errors
  test("E-AUDIT-001 — audit page renders with heading", async ({ page }) => {
    await page.goto("/audit");
    await expect(page).toHaveTitle(/PrefPilot/);
    await expect(page.getByTestId("audit-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Audit/i })).toBeVisible();
  });

  // E-AUDIT-002: Audit page returns 200 (no 404/500)
  test("E-AUDIT-002 — audit page returns 200", async ({ page }) => {
    const response = await page.goto("/audit");
    expect(response?.status()).toBe(200);
  });

  // E-AUDIT-003: User submits preference audit and sees engine running
  test.fixme("E-AUDIT-003 — preference audit submission triggers engine (PERF-100)", async ({
    page,
  }) => {
    await page.goto("/audit");
    // TODO(PERF-100): fill audit form, submit, assert processing state
    await expect(page.getByTestId("audit-progress")).toBeVisible();
  });
});
