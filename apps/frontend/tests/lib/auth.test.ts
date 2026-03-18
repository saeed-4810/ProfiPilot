import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";

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

const mockSignInWithEmailAndPassword = vi.fn();
const mockFirebaseSignOut = vi.fn();
const mockGetIdToken = vi.fn();

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
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
}));

const mockGetFirebaseAuth = vi.fn().mockReturnValue({
  currentUser: null,
});

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseAuth: () => mockGetFirebaseAuth(),
}));

/* Global fetch mock */
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

/* Import after mocks */
import { AuthProvider, useAuth } from "../../lib/auth";

/* ------------------------------------------------------------------ */
/* Test helper — renders a consumer that displays auth state           */
/* ------------------------------------------------------------------ */

function AuthConsumer() {
  const { user, loading, error, signIn, signOut, getIdToken } = useAuth();
  return createElement("div", null, [
    createElement("span", { key: "loading", "data-testid": "auth-loading" }, String(loading)),
    createElement(
      "span",
      { key: "user", "data-testid": "auth-user" },
      user !== null ? (user as { email: string }).email : "null"
    ),
    createElement(
      "span",
      { key: "error", "data-testid": "auth-error" },
      error !== null ? error : "null"
    ),
    createElement(
      "button",
      {
        key: "sign-in",
        "data-testid": "auth-sign-in-btn",
        onClick: () => {
          signIn("test@example.com", "password123").catch(() => {});
        },
      },
      "Sign In"
    ),
    createElement(
      "button",
      {
        key: "sign-out",
        "data-testid": "auth-sign-out-btn",
        onClick: () => {
          signOut().catch(() => {});
        },
      },
      "Sign Out"
    ),
    createElement(
      "button",
      {
        key: "get-token",
        "data-testid": "auth-get-token-btn",
        onClick: () => {
          getIdToken().catch(() => {});
        },
      },
      "Get Token"
    ),
  ]);
}

function renderWithProvider() {
  return render(createElement(AuthProvider, null, createElement(AuthConsumer)));
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  authStateCallback = null;
  authErrorCallback = null;
  mockFetch.mockResolvedValue({ ok: true });
  mockFirebaseSignOut.mockResolvedValue(undefined);
  mockGetFirebaseAuth.mockReturnValue({ currentUser: null });
});

/* ================================================================== */
/* T-SHELL-002: AuthProvider tracks auth state changes                 */
/* ================================================================== */

describe("T-SHELL-002: AuthProvider tracks auth state changes", () => {
  it("starts in loading state", () => {
    renderWithProvider();

    expect(screen.getByTestId("auth-loading")).toHaveTextContent("true");
    expect(screen.getByTestId("auth-user")).toHaveTextContent("null");
  });

  it("updates to authenticated state when user signs in", async () => {
    renderWithProvider();

    // Simulate Firebase auth state change
    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
      expect(screen.getByTestId("auth-user")).toHaveTextContent("user@example.com");
      expect(screen.getByTestId("auth-error")).toHaveTextContent("null");
    });
  });

  it("updates to unauthenticated state when user is null", async () => {
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
      expect(screen.getByTestId("auth-user")).toHaveTextContent("null");
    });
  });

  it("handles auth state error", async () => {
    renderWithProvider();

    act(() => {
      authErrorCallback?.(new Error("Auth service unavailable"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
      expect(screen.getByTestId("auth-error")).toHaveTextContent("Auth service unavailable");
      expect(screen.getByTestId("auth-user")).toHaveTextContent("null");
    });
  });

  it("unsubscribes from auth state on unmount", () => {
    const { unmount } = renderWithProvider();

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== */
/* signIn: Firebase auth → server session cookie                       */
/* ================================================================== */

describe("signIn: Firebase auth → POST /auth/verify-token", () => {
  it("calls signInWithEmailAndPassword and POST /auth/verify-token", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("mock-id-token"), email: "test@example.com" },
    });
    mockFetch.mockResolvedValue({ ok: true });

    const user = userEvent.setup();
    renderWithProvider();

    // Resolve initial auth state
    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "test@example.com",
        "password123"
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/verify-token"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ idToken: "mock-id-token" }),
        })
      );
    });
  });

  it("sets error state when signIn fails", async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(new Error("Invalid credentials"));

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent("Invalid credentials");
    });
  });

  it("sets error state when verify-token fails", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("mock-id-token"), email: "test@example.com" },
    });
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent(
        "Failed to verify session with server."
      );
    });
  });

  it("sets loading true during signIn", async () => {
    // Never-resolving promise to keep loading state
    mockSignInWithEmailAndPassword.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("true");
    });
  });

  it("handles non-Error thrown during signIn", async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue("string error");

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent("Sign-in failed.");
    });
  });
});

/* ================================================================== */
/* T-SHELL-005: Sign-out clears session and redirects                  */
/* ================================================================== */

describe("T-SHELL-005: Sign-out clears session and redirects", () => {
  it("calls POST /auth/logout then Firebase signOut", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await user.click(screen.getByTestId("auth-sign-out-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/logout"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        })
      );
      expect(mockFirebaseSignOut).toHaveBeenCalled();
    });
  });

  it("continues with Firebase signOut even if server logout fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await user.click(screen.getByTestId("auth-sign-out-btn"));

    await waitFor(() => {
      expect(mockFirebaseSignOut).toHaveBeenCalled();
    });
  });
});

/* ================================================================== */
/* getIdToken                                                          */
/* ================================================================== */

describe("getIdToken", () => {
  it("returns null when no user is signed in", async () => {
    mockGetFirebaseAuth.mockReturnValue({ currentUser: null });

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    // Click get-token button — the function returns null but we verify the mock
    await user.click(screen.getByTestId("auth-get-token-btn"));

    // No getIdToken call since currentUser is null
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });

  it("returns token when user is signed in", async () => {
    mockGetIdToken.mockResolvedValue("fresh-token");
    mockGetFirebaseAuth.mockReturnValue({
      currentUser: { getIdToken: mockGetIdToken },
    });

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.({ email: "user@example.com", uid: "123" });
    });

    await user.click(screen.getByTestId("auth-get-token-btn"));

    await waitFor(() => {
      expect(mockGetIdToken).toHaveBeenCalled();
    });
  });
});

/* ================================================================== */
/* useAuth outside provider                                            */
/* ================================================================== */

describe("useAuth outside AuthProvider", () => {
  it("throws error when used outside AuthProvider", () => {
    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(createElement(AuthConsumer));
    }).toThrow("useAuth must be used within an AuthProvider");

    consoleSpy.mockRestore();
  });
});
