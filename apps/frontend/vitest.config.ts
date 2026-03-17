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
      include: ["app/**", "components/**", "lib/**"],
      exclude: [
        "app/layout.tsx", // Root layout — metadata export, no testable logic
        "app/page.tsx", // Root redirect — no testable logic
        "app/globals.css", // CSS file
        // app/audit/** — removed: PERF-100 implemented
        "app/dashboard/**", // Shell placeholder — not implemented yet
        "app/results/**", // Shell placeholder — not implemented yet
        "app/export/**", // Shell placeholder — not implemented yet
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
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
