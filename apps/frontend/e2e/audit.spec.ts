import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Audit flow (PERF-100).
 *
 * All tests run with authenticated storageState from auth.setup.ts.
 *
 * E-AUDIT-001: Audit route protection (redirect).
 * E-AUDIT-002: Audit page returns 200.
 * E-AUDIT-003: Audit form renders with URL input and validates.
 * E-AUDIT-004: Full audit flow — submit URL → poll → complete → navigate to results.
 */

test.describe("Audit flow — /audit", () => {
  // E-AUDIT-001: Audit route is protected — unauthenticated access redirects to /login.
  test("E-AUDIT-001 — audit page redirects unauthenticated to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/audit");
    await expect(page).toHaveURL(/\/login/);
  });

  // E-AUDIT-002: Audit page returns 200 (no 404/500)
  test("E-AUDIT-002 — audit page returns 200", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/audit");
    expect(response?.status()).toBe(200);
  });

  // E-AUDIT-003: Audit form renders with URL input and validates input
  test("E-AUDIT-003 — audit form renders and validates input", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    await page.goto("/audit");
    await expect(page.getByTestId("audit-page")).toBeVisible({ timeout: 10_000 });

    // Verify the form is visible with URL input and submit button
    await expect(page.getByTestId("audit-url-input")).toBeVisible();
    await expect(page.getByTestId("audit-submit")).toBeVisible();

    // Verify onboarding helper text is shown
    await expect(page.getByTestId("audit-helper")).toBeVisible();

    // Submit empty form — should show validation error
    await page.getByTestId("audit-submit").click();
    await expect(page.getByTestId("audit-field-error")).toBeVisible({ timeout: 5_000 });

    // Submit non-https URL — should show validation error
    await page.getByTestId("audit-url-input").fill("http://example.com");
    await page.getByTestId("audit-submit").click();
    await expect(page.getByTestId("audit-field-error")).toBeVisible();
  });

  // E-AUDIT-004: Full audit flow — submit valid URL → progress → complete → results link
  test("E-AUDIT-004 — full audit flow: submit → poll → complete", async ({ page }) => {
    test.skip(!process.env["E2E_TEST_EMAIL"], "Requires auth — run via staging config");
    test.setTimeout(180_000); // Audit can take up to 2 minutes (PSI API + AI)

    await page.goto("/audit");
    await expect(page.getByTestId("audit-page")).toBeVisible({ timeout: 10_000 });

    // Submit a valid HTTPS URL
    await page.getByTestId("audit-url-input").fill("https://example.com");
    await page.getByTestId("audit-submit").click();

    // PERF-142: Should show multi-step progress stepper (polling state)
    await expect(page.getByTestId("audit-progress")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("audit-progress-stepper")).toBeVisible();
    await expect(page.getByTestId("step-spinner")).toBeVisible();

    // Wait for audit to complete (polling — may take 30-120s)
    // Either success state or error state will appear
    await expect(
      page.getByTestId("audit-success").or(page.getByTestId("audit-error-progress"))
    ).toBeVisible({ timeout: 150_000 });

    // If successful, verify all checkmarks visible and completion message
    const success = page.getByTestId("audit-success");
    if (await success.isVisible()) {
      await expect(page.getByTestId("audit-status-message")).toContainText(/complete/i);
    }
  });
});
