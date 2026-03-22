import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for Analytics Wiring (PERF-122).
 *
 * E-ANALYTICS-001: Active — app loads without JS errors when PostHog env vars are absent.
 * E-ANALYTICS-002: fixme — requires PostHog API key configured + PostHog Live Events API
 *   to verify events reach the backend. Will be activated when PostHog project is set up.
 *
 * These tests verify that the PostHog integration does not break page rendering
 * and degrades gracefully when analytics is not configured.
 */

test.describe("Analytics wiring — PERF-122", () => {
  // E-ANALYTICS-001: App loads without JS errors when PostHog is absent
  test("E-ANALYTICS-001 — app loads without JS errors when PostHog env vars are absent", async ({
    page,
  }) => {
    // Collect console errors during page load
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to login page (public, no auth required)
    await page.goto("/login");

    // Page should render without PostHog-related JS errors
    await expect(page.getByTestId("login-page")).toBeVisible();

    // Filter for PostHog-specific errors (ignore unrelated errors)
    const posthogErrors = consoleErrors.filter(
      (err) => err.toLowerCase().includes("posthog") || err.toLowerCase().includes("analytics")
    );
    expect(posthogErrors).toHaveLength(0);
  });

  // E-ANALYTICS-002: PostHog events reach the analytics backend
  // fixme — requires PostHog API key configured in .env.local and PostHog project set up.
  // When activated, this test will:
  // 1. Configure PostHog with a test API key
  // 2. Navigate to a page
  // 3. Intercept the PostHog /capture network request
  // 4. Verify the page_view event payload
  test.fixme("E-ANALYTICS-002 — PostHog events reach analytics backend", async ({
    page: _page,
  }) => {
    // Will be implemented when PostHog project is configured
  });
});
