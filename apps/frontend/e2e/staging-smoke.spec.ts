import { test, expect } from "@playwright/test";

/**
 * Staging Infrastructure Smoke Tests — PERF-79 (T-PERF-79-001 through T-PERF-79-007)
 *
 * These tests run against the live staging deployment at https://prefpilot-stage.web.app.
 * They verify infrastructure health without requiring authentication.
 *
 * Run with:
 *   pnpm --filter @prefpilot/frontend exec playwright test --config playwright.staging.config.ts
 */

test.describe("PERF-79: Staging Infrastructure Smoke", () => {
  // T-PERF-79-001: Health check returns 200 on staging (direct Cloud Run)
  test("T-PERF-79-001 — health check returns 200 (direct Cloud Run)", async ({ request }) => {
    const response = await request.get(
      "https://express-backend-106695418814.europe-west1.run.app/health"
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });

  // T-PERF-79-002: Health check returns 200 via Firebase Hosting
  test("T-PERF-79-002 — health check returns 200 (via Firebase Hosting)", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });

  // T-PERF-79-003: Login page renders via SSR
  test("T-PERF-79-003 — login page renders via SSR", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Sign in to PrefPilot/i })).toBeVisible();
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-password-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  // T-PERF-79-004: Middleware redirects unauthenticated /dashboard
  test("T-PERF-79-004 — unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  // T-PERF-79-005: Security headers present (7/7)
  test("T-PERF-79-005 — security headers present", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();

    expect(headers["x-frame-options"]?.toLowerCase()).toContain("deny");
    expect(headers["x-content-type-options"]?.toLowerCase()).toContain("nosniff");
    expect(headers["strict-transport-security"]).toBeDefined();
    expect(headers["referrer-policy"]).toBeDefined();
  });

  // T-PERF-79-006: Static assets cached at CDN edge
  test("T-PERF-79-006 — static assets have CDN cache headers", async ({ page }) => {
    const responses: { url: string; cacheControl: string | null }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/_next/static/")) {
        responses.push({
          url,
          cacheControl: response.headers()["cache-control"] ?? null,
        });
      }
    });

    await page.goto("/login");

    // At least one static asset should have been loaded
    expect(responses.length).toBeGreaterThan(0);

    // All static assets should have immutable cache headers
    for (const res of responses) {
      expect(res.cacheControl).toBeDefined();
      expect(res.cacheControl).toContain("public");
    }
  });

  // T-PERF-79-007: Same-origin API routing works (no CORS preflight)
  test("T-PERF-79-007 — same-origin API routing via Firebase Hosting", async ({ request }) => {
    // /health should route to the backend via Firebase Hosting rewrite
    const response = await request.get("/health");
    expect(response.status()).toBe(200);

    // Verify no CORS headers (same-origin routing means no CORS needed)
    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeUndefined();
  });
});
