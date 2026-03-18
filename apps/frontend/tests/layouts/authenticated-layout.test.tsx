import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
}));

/** Captured onAuthStateChanged callback for manual triggering. */
let authStateCallback: ((user: unknown) => void) | null = null;
let authErrorCallback: ((error: Error) => void) | null = null;
const mockUnsubscribe = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (
    _auth: unknown,
    onUser: (user: unknown) => void,
    onError: (error: Error) => void
  ) => {
    authStateCallback = onUser;
    authErrorCallback = onError;
    return mockUnsubscribe;
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
}));

/* Import after mocks */
import AuthenticatedLayout from "../../app/(authenticated)/layout";

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  authStateCallback = null;
  authErrorCallback = null;
});

/* ================================================================== */
/* U-SHELL-001: Loading skeleton while auth resolves                   */
/* ================================================================== */

describe("U-SHELL-001: Loading skeleton while auth resolves", () => {
  it("shows loading skeleton before auth state resolves", () => {
    render(
      <AuthenticatedLayout>
        <p>Protected content</p>
      </AuthenticatedLayout>
    );

    expect(screen.getByTestId("auth-loading-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("auth-loading-skeleton")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("auth-loading-skeleton")).toHaveAttribute("aria-label", "Loading");
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("hides skeleton and shows content after auth resolves with user", async () => {
    render(
      <AuthenticatedLayout>
        <p>Protected content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("auth-loading-skeleton")).not.toBeInTheDocument();
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Auth guard — redirect unauthenticated users                         */
/* ================================================================== */

describe("Auth guard — redirect unauthenticated users to /login", () => {
  it("redirects to /login when auth resolves with null user", async () => {
    render(
      <AuthenticatedLayout>
        <p>Protected content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authStateCallback?.(null);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("does not render children when user is null", async () => {
    render(
      <AuthenticatedLayout>
        <p>Protected content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authStateCallback?.(null);
    });

    await waitFor(() => {
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    });
  });

  it("does not redirect when user is authenticated", async () => {
    render(
      <AuthenticatedLayout>
        <p>Protected content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* U-SHELL-002: Skip-to-content link for accessibility                 */
/* ================================================================== */

describe("U-SHELL-002: Skip-to-content link for accessibility", () => {
  it("renders skip-to-content link", () => {
    render(
      <AuthenticatedLayout>
        <p>Content</p>
      </AuthenticatedLayout>
    );

    const skipLink = screen.getByTestId("skip-to-content");
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink).toHaveTextContent("Skip to content");
  });

  it("skip link is always present (even during loading)", () => {
    render(
      <AuthenticatedLayout>
        <p>Content</p>
      </AuthenticatedLayout>
    );

    // During loading state, skip link should still be present
    expect(screen.getByTestId("skip-to-content")).toBeInTheDocument();
    expect(screen.getByTestId("auth-loading-skeleton")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* Navigation rendered on authenticated pages                          */
/* ================================================================== */

describe("Navigation rendered on authenticated pages", () => {
  it("renders navigation when user is authenticated", async () => {
    render(
      <AuthenticatedLayout>
        <p>Content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("navigation")).toBeInTheDocument();
    });
  });

  it("renders main content area with correct id", async () => {
    render(
      <AuthenticatedLayout>
        <p>Content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await waitFor(() => {
      const main = screen.getByTestId("authenticated-main");
      expect(main).toBeInTheDocument();
      expect(main).toHaveAttribute("id", "main-content");
    });
  });
});

/* ================================================================== */
/* Auth error handling in layout                                       */
/* ================================================================== */

describe("Auth error handling in layout", () => {
  it("redirects to /login when auth state errors", async () => {
    render(
      <AuthenticatedLayout>
        <p>Content</p>
      </AuthenticatedLayout>
    );

    act(() => {
      authErrorCallback?.(new Error("Auth service unavailable"));
    });

    // Error sets user to null, loading to false → should redirect
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
