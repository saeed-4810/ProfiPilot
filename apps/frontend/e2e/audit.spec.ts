import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Preference Audit flow (PERF-100).
 *
 * Shell tests (E-AUDIT-001, E-AUDIT-002) run against the scaffold.
 * Feature test (E-AUDIT-003) activated with PERF-100 frontend implementation.
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

  // E-AUDIT-003: User submits URL and sees audit progress indicator
  test("E-AUDIT-003 — audit submission shows URL form and validates input", async ({ page }) => {
    await page.goto("/audit");

    // Verify the form is visible with URL input and submit button
    await expect(page.getByTestId("audit-url-input")).toBeVisible();
    await expect(page.getByTestId("audit-submit")).toBeVisible();

    // Verify onboarding helper text is shown
    await expect(page.getByTestId("audit-helper")).toBeVisible();
    await expect(page.getByTestId("audit-helper")).toContainText(
      "Add one URL to run your first audit"
    );

    // Submit empty form — should show validation error
    await page.getByTestId("audit-submit").click();
    await expect(page.getByTestId("audit-field-error")).toBeVisible();
    await expect(page.getByTestId("audit-field-error")).toContainText(
      "Please enter a valid URL including https://"
    );

    // Submit non-https URL — should show validation error
    await page.getByTestId("audit-url-input").fill("http://example.com");
    await page.getByTestId("audit-submit").click();
    await expect(page.getByTestId("audit-field-error")).toBeVisible();

    // Submit valid https URL — form submits (will fail to reach backend in E2E
    // but the form submission and loading state transition is testable)
    await page.getByTestId("audit-url-input").fill("https://example.com");
    await page.getByTestId("audit-submit").click();

    // The form should transition to loading state (progress indicator)
    // or show an error if backend is unreachable — either proves the form submitted
    await expect(
      page.getByTestId("audit-progress").or(page.getByTestId("audit-error"))
    ).toBeVisible({ timeout: 10_000 });
  });
});
