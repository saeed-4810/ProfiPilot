import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockUser = { email: "test@example.com", uid: "123" };

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: mockSignOut,
    getIdToken: vi.fn(),
  }),
}));

/* Import after mocks */
import { Navigation } from "../../components/Navigation";

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = "/dashboard";
});

/* ================================================================== */
/* T-SHELL-004: Authenticated user sees navigation                     */
/* ================================================================== */

describe("T-SHELL-004: Authenticated user sees navigation with active state", () => {
  it("renders navigation element with aria-label", () => {
    render(<Navigation />);

    const nav = screen.getByTestId("navigation");
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute("aria-label", "Main navigation");
  });

  it("renders all nav links", () => {
    render(<Navigation />);

    expect(screen.getByTestId("nav-link-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-audit")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-results")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-export")).toBeInTheDocument();
  });

  it("marks active link with aria-current=page", () => {
    mockPathname = "/audit";
    render(<Navigation />);

    expect(screen.getByTestId("nav-link-audit")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-link-dashboard")).not.toHaveAttribute("aria-current");
  });

  it("highlights active link with bg-neutral-800 class (not just hover)", () => {
    mockPathname = "/dashboard";
    render(<Navigation />);

    // Active link has bg-neutral-800 as a standalone class (not just hover:bg-neutral-800)
    const activeClasses = screen.getByTestId("nav-link-dashboard").className.split(" ");
    const inactiveClasses = screen.getByTestId("nav-link-audit").className.split(" ");

    expect(activeClasses).toContain("bg-neutral-800");
    expect(inactiveClasses).not.toContain("bg-neutral-800");
  });

  it("displays user email", () => {
    render(<Navigation />);

    expect(screen.getByTestId("nav-user-email")).toHaveTextContent("test@example.com");
  });

  it("renders sign-out button", () => {
    render(<Navigation />);

    expect(screen.getByTestId("nav-sign-out")).toBeInTheDocument();
    expect(screen.getByTestId("nav-sign-out")).toHaveTextContent("Sign out");
  });

  it("calls signOut when sign-out button is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-sign-out"));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it("renders brand link pointing to /dashboard", () => {
    render(<Navigation />);

    const brand = screen.getByTestId("nav-brand");
    expect(brand).toHaveTextContent("PrefPilot");
    expect(brand).toHaveAttribute("href", "/dashboard");
  });

  it("applies active state to results link when on /results", () => {
    mockPathname = "/results";
    render(<Navigation />);

    expect(screen.getByTestId("nav-link-results")).toHaveAttribute("aria-current", "page");
  });

  it("applies active state to export link when on /export", () => {
    mockPathname = "/export";
    render(<Navigation />);

    expect(screen.getByTestId("nav-link-export")).toHaveAttribute("aria-current", "page");
  });
});

/* ================================================================== */
/* U-SHELL-003: Navigation responsive on mobile                        */
/* ================================================================== */

describe("U-SHELL-003: Navigation responsive on mobile (hamburger menu)", () => {
  it("renders mobile toggle button", () => {
    render(<Navigation />);

    const toggle = screen.getByTestId("nav-mobile-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-label", "Open menu");
  });

  it("opens mobile menu when toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();
    expect(screen.getByTestId("nav-mobile-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-mobile-toggle")).toHaveAttribute("aria-label", "Close menu");
  });

  it("closes mobile menu when toggle is clicked again", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
  });

  it("renders mobile nav links when menu is open", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-link-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nav-mobile-link-audit")).toBeInTheDocument();
    expect(screen.getByTestId("nav-mobile-link-results")).toBeInTheDocument();
    expect(screen.getByTestId("nav-mobile-link-export")).toBeInTheDocument();
  });

  it("marks active mobile link with aria-current=page", async () => {
    mockPathname = "/audit";
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-link-audit")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-mobile-link-dashboard")).not.toHaveAttribute("aria-current");
  });

  it("closes mobile menu when a link is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-mobile-link-audit"));

    await waitFor(() => {
      expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
    });
  });

  it("displays user email in mobile menu", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-user-email")).toHaveTextContent("test@example.com");
  });

  it("renders mobile sign-out button", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-sign-out")).toBeInTheDocument();
  });

  it("calls signOut and closes menu when mobile sign-out is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    await user.click(screen.getByTestId("nav-mobile-sign-out"));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
    });
  });
});
