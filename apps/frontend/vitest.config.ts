import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["app/**", "components/**", "lib/**", "middleware.ts"],
      exclude: [
        "app/layout.tsx", // Root layout — metadata export, no testable logic
        "app/page.tsx", // Root redirect — no testable logic
        "app/globals.css", // CSS file
        "app/(auth)/layout.tsx", // Auth route group layout — trivial AuthProvider wrapper, no logic
        "app/runtime-validation/**", // Staging-only diagnostic dashboard — tested by running it, not unit tests. Blocked in production by middleware.
        // app/(authenticated)/audit/** — PERF-100 implemented, tested in tests/pages/audit.test.tsx
        // app/(authenticated)/dashboard/** — PERF-125 implemented, tested in tests/pages/dashboard.test.tsx
        // app/(authenticated)/results/** — PERF-102 implemented, tested in tests/pages/results.test.tsx
        // app/(authenticated)/export/** — PERF-103 implemented, tested in tests/pages/export.test.tsx
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 99,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
