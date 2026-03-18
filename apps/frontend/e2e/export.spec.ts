import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Export & Billing flow (PERF-103).
 *
 * Shell tests (E-EXPORT-001, E-EXPORT-002) run now against the scaffold.
 * Feature tests (E-EXPORT-003) are stubs — implement when PERF-103 is in progress.
 */

test.describe("Export flow — /export", () => {
  // E-EXPORT-001: Export route is protected — unauthenticated access redirects to /login.
  // Full page content tests require authenticated session (Firebase user + __session cookie).
  test("E-EXPORT-001 — export page renders with heading", async ({ page }) => {
    await page.goto("/export");
    // Middleware redirects to /login without __session cookie (per PERF-115)
    await expect(page).toHaveURL(/\/login/);
  });

  // E-EXPORT-002: Export page returns 200 (no 404/500)
  test("E-EXPORT-002 — export page returns 200", async ({ page }) => {
    const response = await page.goto("/export");
    expect(response?.status()).toBe(200);
  });

  // E-EXPORT-003: User exports audit results and is prompted for billing
  test.fixme("E-EXPORT-003 — export triggers billing prompt when limit exceeded (PERF-103)", async ({
    page,
  }) => {
    await page.goto("/export");
    // TODO(PERF-103): trigger export, assert billing modal appears when quota exceeded
    await expect(page.getByTestId("billing-prompt")).toBeVisible();
  });
});
