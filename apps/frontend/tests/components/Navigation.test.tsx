import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
/* T-SHELL-004: Authenticated user sees navigation with active state   */
/* ================================================================== */

describe("T-SHELL-004: Navigation renders with active state", () => {
  it("renders navigation wrapper element", () => {
    render(<Navigation />);

    expect(screen.getByTestId("navigation")).toBeInTheDocument();
  });

  it("renders top nav bar with brand", () => {
    render(<Navigation />);

    const brand = screen.getByTestId("nav-brand");
    expect(brand).toBeInTheDocument();
    expect(brand).toHaveTextContent("NIMBLEVITALS");
    expect(brand).toHaveAttribute("href", "/dashboard");
  });

  it("renders desktop sidebar with nav items", () => {
    render(<Navigation />);

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav")).toHaveAttribute("aria-label", "Main navigation");
  });

  it("renders active sidebar items: Overview and Performance", () => {
    render(<Navigation />);

    const overview = screen.getByTestId("nav-item-overview");
    const performance = screen.getByTestId("nav-item-performance");

    expect(overview).toBeInTheDocument();
    expect(performance).toBeInTheDocument();
    // Overview links to /dashboard
    expect(overview).toHaveAttribute("href", "/dashboard");
    // Performance links to /audit
    expect(performance).toHaveAttribute("href", "/audit");
  });

  it("marks Overview as active when on /dashboard", () => {
    mockPathname = "/dashboard";
    render(<Navigation />);

    expect(screen.getByTestId("nav-item-overview")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-item-performance")).not.toHaveAttribute("aria-current");
  });

  it("marks Performance as active when on /audit", () => {
    mockPathname = "/audit";
    render(<Navigation />);

    expect(screen.getByTestId("nav-item-performance")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-item-overview")).not.toHaveAttribute("aria-current");
  });

  it("renders coming-soon items as non-navigable spans", () => {
    render(<Navigation />);

    const security = screen.getByTestId("nav-item-security");
    const accessibility = screen.getByTestId("nav-item-accessibility");
    const seo = screen.getByTestId("nav-item-seo");

    // Coming-soon items are <span>, not <a> — no href attribute
    expect(security.tagName).toBe("SPAN");
    expect(accessibility.tagName).toBe("SPAN");
    expect(seo.tagName).toBe("SPAN");

    // They have accessible labels
    expect(security).toHaveAttribute("aria-label", "Security — Coming soon");
    expect(accessibility).toHaveAttribute("aria-label", "Accessibility — Coming soon");
    expect(seo).toHaveAttribute("aria-label", "SEO — Coming soon");
  });

  it("displays user email in top nav", () => {
    render(<Navigation />);

    expect(screen.getByTestId("nav-user-email")).toHaveTextContent("test@example.com");
  });

  it("renders sign-out button in top nav", () => {
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
});

/* ================================================================== */
/* Top nav bar links                                                   */
/* ================================================================== */

describe("Top nav bar links", () => {
  it("renders top nav links container", () => {
    render(<Navigation />);

    expect(screen.getByTestId("nav-top-links")).toBeInTheDocument();
    expect(screen.getByTestId("nav-top-links")).toHaveAttribute("aria-label", "Top navigation");
  });

  it("renders active top nav links: Dashboard and Audits", () => {
    render(<Navigation />);

    const dashboard = screen.getByTestId("nav-top-dashboard");
    const audits = screen.getByTestId("nav-top-audits");

    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(audits).toHaveAttribute("href", "/audit");
  });

  it("renders coming-soon top nav items as non-navigable spans", () => {
    render(<Navigation />);

    const projects = screen.getByTestId("nav-top-projects");
    const settings = screen.getByTestId("nav-top-settings");

    expect(projects.tagName).toBe("SPAN");
    expect(settings.tagName).toBe("SPAN");
    expect(projects).toHaveAttribute("aria-label", "Projects — Coming soon");
    expect(settings).toHaveAttribute("aria-label", "Settings — Coming soon");
  });

  it("marks Dashboard as active in top nav when on /dashboard", () => {
    mockPathname = "/dashboard";
    render(<Navigation />);

    expect(screen.getByTestId("nav-top-dashboard")).toHaveAttribute("aria-current", "page");
  });

  it("marks Audits as active in top nav when on /audit", () => {
    mockPathname = "/audit";
    render(<Navigation />);

    expect(screen.getByTestId("nav-top-audits")).toHaveAttribute("aria-current", "page");
  });
});

/* ================================================================== */
/* PERF-165 AC8: "New Audit" button in top nav                        */
/* ================================================================== */

describe("PERF-165 AC8: New Audit button in top nav", () => {
  it("renders New Audit button linking to /audit", () => {
    render(<Navigation />);

    const btn = screen.getByTestId("nav-new-audit");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("href", "/audit");
    expect(btn).toHaveTextContent("New Audit");
  });
});

/* ================================================================== */
/* Sidebar footer: Support + Docs (UX-001 Step 7)                     */
/* ================================================================== */

describe("Sidebar footer: Support + Docs", () => {
  it("renders sidebar footer with support and docs links", () => {
    render(<Navigation />);

    expect(screen.getByTestId("sidebar-footer")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-support-link")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-docs-link")).toBeInTheDocument();
  });

  it("support link points to mailto", () => {
    render(<Navigation />);

    expect(screen.getByTestId("sidebar-support-link")).toHaveAttribute(
      "href",
      "mailto:support@nimblevitals.app"
    );
  });

  it("docs link opens in new tab", () => {
    render(<Navigation />);

    const docsLink = screen.getByTestId("sidebar-docs-link");
    expect(docsLink).toHaveAttribute("target", "_blank");
    expect(docsLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});

/* ================================================================== */
/* Help button (UX-001 Step 7 — top nav support path)                  */
/* ================================================================== */

describe("Help button in top nav", () => {
  it("renders help button with accessible label", () => {
    render(<Navigation />);

    const helpBtn = screen.getByTestId("nav-help-button");
    expect(helpBtn).toBeInTheDocument();
    expect(helpBtn).toHaveAttribute("aria-label", "Help");
  });
});

/* ================================================================== */
/* U-SHELL-003: Navigation responsive on mobile                        */
/* ================================================================== */

describe("U-SHELL-003: Navigation responsive on mobile (drawer)", () => {
  it("renders mobile toggle button", () => {
    render(<Navigation />);

    const toggle = screen.getByTestId("nav-mobile-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-label", "Open menu");
  });

  it("opens mobile drawer when toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();
    expect(screen.getByTestId("nav-mobile-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-mobile-toggle")).toHaveAttribute("aria-label", "Close menu");
  });

  it("closes mobile drawer when toggle is clicked again", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
  });

  it("renders mobile nav items when drawer is open", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-item-overview")).toBeInTheDocument();
    expect(screen.getByTestId("nav-mobile-item-performance")).toBeInTheDocument();
  });

  it("renders coming-soon items in mobile drawer as non-navigable", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    const security = screen.getByTestId("nav-mobile-item-security");
    const accessibility = screen.getByTestId("nav-mobile-item-accessibility");
    const seo = screen.getByTestId("nav-mobile-item-seo");

    expect(security.tagName).toBe("SPAN");
    expect(accessibility.tagName).toBe("SPAN");
    expect(seo.tagName).toBe("SPAN");
  });

  it("marks active mobile link with aria-current=page", async () => {
    mockPathname = "/audit";
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("nav-mobile-item-performance")).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByTestId("nav-mobile-item-overview")).not.toHaveAttribute("aria-current");
  });

  it("closes mobile drawer when a link is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-mobile-item-overview"));

    await waitFor(() => {
      expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
    });
  });

  it("displays user email in mobile drawer", async () => {
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

  it("calls signOut and closes drawer when mobile sign-out is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    await user.click(screen.getByTestId("nav-mobile-sign-out"));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
    });
  });

  it("renders support and docs links in mobile drawer", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));

    expect(screen.getByTestId("mobile-support-link")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-docs-link")).toBeInTheDocument();
  });

  it("closes drawer when backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    await user.click(screen.getByTestId("mobile-backdrop"));

    await waitFor(() => {
      expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
    });
  });

  it("closes drawer when Escape key is pressed on backdrop", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    // Fire keyDown Escape on the backdrop element
    fireEvent.keyDown(screen.getByTestId("mobile-backdrop"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("nav-mobile-menu")).not.toBeInTheDocument();
    });
  });

  it("does not close drawer on non-Escape key press on backdrop", async () => {
    const user = userEvent.setup();
    render(<Navigation />);

    await user.click(screen.getByTestId("nav-mobile-toggle"));
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();

    // Fire keyDown with a non-Escape key on the backdrop
    fireEvent.keyDown(screen.getByTestId("mobile-backdrop"), { key: "a" });

    // Drawer should still be open
    expect(screen.getByTestId("nav-mobile-menu")).toBeInTheDocument();
  });
});
