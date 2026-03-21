import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation for LoginPage (useRouter) and ResultsPage (useSearchParams)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

// Mock auth lib to prevent Firebase initialization
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signOut: vi.fn(),
    getIdToken: vi.fn(),
    user: null,
    loading: false,
    error: null,
  }),
  getAuthErrorMessage: () => "An unexpected error occurred.",
}));

// Mock audit lib for AuditPage
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAudit: vi.fn(),
    getAuditStatus: vi.fn(),
    isTerminalStatus: () => false,
  };
});

// Mock results lib for ResultsPage
vi.mock("@/lib/results", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getRecommendations: vi.fn().mockResolvedValue({ auditId: "", recommendations: [] }),
    getSummary: vi.fn().mockResolvedValue({
      auditId: "",
      executiveSummary: null,
      tickets: [],
      aiAvailable: false,
    }),
  };
});

import LoginPage from "../../app/(auth)/login/page";
import DashboardPage from "../../app/(authenticated)/dashboard/page";
import AuditPage from "../../app/(authenticated)/audit/page";
import ResultsPage from "../../app/(authenticated)/results/page";
import ExportPage from "../../app/(authenticated)/export/page";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("T-P105-003 — Shell pages render without errors", () => {
  it("LoginPage renders auth shell", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("DashboardPage renders dashboard shell", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("AuditPage renders audit page with form", () => {
    render(<AuditPage />);
    expect(screen.getByTestId("audit-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /audit/i })).toBeInTheDocument();
    expect(screen.getByTestId("audit-url-input")).toBeInTheDocument();
  });

  it("ResultsPage renders results shell", () => {
    render(<ResultsPage />);
    expect(screen.getByTestId("results-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /results/i })).toBeInTheDocument();
  });

  it("ExportPage renders export shell", () => {
    render(<ExportPage />);
    expect(screen.getByTestId("export-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /export/i })).toBeInTheDocument();
  });
});
