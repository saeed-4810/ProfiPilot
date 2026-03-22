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
const mockCreateUserWithEmailAndPassword = vi.fn();
const mockSendEmailVerification = vi.fn();
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
  createUserWithEmailAndPassword: (...args: unknown[]) =>
    mockCreateUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args: unknown[]) => mockSendEmailVerification(...args),
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
import { AuthProvider, useAuth, getAuthErrorMessage } from "../../lib/auth";

/* ------------------------------------------------------------------ */
/* Test helper — renders a consumer that displays auth state           */
/* ------------------------------------------------------------------ */

function AuthConsumer() {
  const { user, loading, error, signIn, signUp, sendVerificationEmail, signOut, getIdToken } =
    useAuth();
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
        key: "sign-up",
        "data-testid": "auth-sign-up-btn",
        onClick: () => {
          signUp("new@example.com", "password123").catch(() => {});
        },
      },
      "Sign Up"
    ),
    createElement(
      "button",
      {
        key: "resend-verification",
        "data-testid": "auth-resend-verification-btn",
        onClick: () => {
          sendVerificationEmail().catch(() => {});
        },
      },
      "Resend Verification"
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ code: "INTERNAL_ERROR", message: "Server error" }),
    });

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

  it("throws error with code auth/email-not-verified when server returns 403 AUTH_EMAIL_NOT_VERIFIED", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("mock-id-token"), email: "unverified@example.com" },
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          code: "AUTH_EMAIL_NOT_VERIFIED",
          message: "Please verify your email address before signing in.",
        }),
    });

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent(
        "Please verify your email address before signing in."
      );
    });
  });

  it("uses fallback message when server returns AUTH_EMAIL_NOT_VERIFIED without message", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("mock-id-token"), email: "unverified@example.com" },
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ code: "AUTH_EMAIL_NOT_VERIFIED" }),
    });

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-in-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent(
        "Please verify your email address before signing in."
      );
    });
  });

  it("falls back to generic error when server returns non-JSON 403", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("mock-id-token"), email: "test@example.com" },
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.reject(new Error("Not JSON")),
    });

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
});

/* ================================================================== */
/* T-PERF-138-003: sendVerificationEmail resends to current user       */
/* ================================================================== */

describe("T-PERF-138-003: sendVerificationEmail resends to current user", () => {
  it("calls sendEmailVerification on the current user", async () => {
    const mockUser = { email: "test@example.com" };
    mockGetFirebaseAuth.mockReturnValue({ currentUser: mockUser });
    mockSendEmailVerification.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(mockUser);
    });

    await user.click(screen.getByTestId("auth-resend-verification-btn"));

    await waitFor(() => {
      expect(mockSendEmailVerification).toHaveBeenCalledWith(mockUser);
    });
  });

  it("throws error when no user is signed in", async () => {
    mockGetFirebaseAuth.mockReturnValue({ currentUser: null });

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    // The button click will throw — but the catch in AuthConsumer swallows it
    await user.click(screen.getByTestId("auth-resend-verification-btn"));

    // No crash — the error is caught by the .catch() in AuthConsumer
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* T-PERF-138-002: signUp creates account and sends verification email */
/* ================================================================== */

describe("T-PERF-138-002: signUp creates account and sends verification email (ADR-028)", () => {
  it("calls createUserWithEmailAndPassword and sendEmailVerification (no verify-token)", async () => {
    const mockUser = { email: "new@example.com" };
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });
    mockSendEmailVerification.mockResolvedValue(undefined);
    mockFirebaseSignOut.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-up-btn"));

    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "new@example.com",
        "password123"
      );
      expect(mockSendEmailVerification).toHaveBeenCalledWith(mockUser);
      expect(mockFirebaseSignOut).toHaveBeenCalled();
      // verify-token should NOT be called — email must be verified first
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it("sets error state when signUp fails (email already in use)", async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValue(
      Object.assign(new Error("Firebase: Error (auth/email-already-in-use)."), {
        code: "auth/email-already-in-use",
      })
    );

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-up-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).not.toHaveTextContent("null");
    });
  });

  it("sets error state when sendEmailVerification fails", async () => {
    const mockUser = { email: "new@example.com" };
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });
    mockSendEmailVerification.mockRejectedValue(new Error("Too many requests"));

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-up-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent("Too many requests");
    });
  });

  it("sets loading true during signUp", async () => {
    mockCreateUserWithEmailAndPassword.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByTestId("auth-sign-up-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("true");
    });
  });

  it("handles non-Error thrown during signUp", async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValue("string error");

    const user = userEvent.setup();
    renderWithProvider();

    act(() => {
      authStateCallback?.(null);
    });

    await user.click(screen.getByTestId("auth-sign-up-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent("Sign-up failed.");
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

/* ================================================================== */
/* getAuthErrorMessage — Firebase error code mapping                    */
/* ================================================================== */

describe("getAuthErrorMessage", () => {
  it("returns mapped message for auth/invalid-credential", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/invalid-credential" });
    expect(getAuthErrorMessage(err)).toBe("Invalid email or password. Please try again.");
  });

  it("returns mapped message for auth/user-not-found", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/user-not-found" });
    expect(getAuthErrorMessage(err)).toBe("No account found with this email address.");
  });

  it("returns mapped message for auth/wrong-password", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/wrong-password" });
    expect(getAuthErrorMessage(err)).toBe("Incorrect password. Please try again.");
  });

  it("returns mapped message for auth/too-many-requests", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/too-many-requests" });
    expect(getAuthErrorMessage(err)).toBe("Too many attempts. Please wait and try again.");
  });

  it("returns mapped message for auth/network-request-failed", () => {
    const err = Object.assign(new Error("Firebase: Error"), {
      code: "auth/network-request-failed",
    });
    expect(getAuthErrorMessage(err)).toBe("Network error. Check your connection and try again.");
  });

  it("returns mapped message for auth/invalid-email", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/invalid-email" });
    expect(getAuthErrorMessage(err)).toBe("Please enter a valid email address.");
  });

  it("returns mapped message for auth/user-disabled", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/user-disabled" });
    expect(getAuthErrorMessage(err)).toBe("This account has been disabled. Contact support.");
  });

  it("returns mapped message for auth/email-already-in-use", () => {
    const err = Object.assign(new Error("Firebase: Error"), {
      code: "auth/email-already-in-use",
    });
    expect(getAuthErrorMessage(err)).toBe("An account with this email already exists.");
  });

  it("returns mapped message for auth/weak-password", () => {
    const err = Object.assign(new Error("Firebase: Error"), { code: "auth/weak-password" });
    expect(getAuthErrorMessage(err)).toBe("Password must be at least 6 characters.");
  });

  it("returns mapped message for auth/email-not-verified", () => {
    const err = Object.assign(new Error("Server error"), { code: "auth/email-not-verified" });
    expect(getAuthErrorMessage(err)).toBe("Please verify your email address before signing in.");
  });

  it("returns error.message for non-Firebase errors with message", () => {
    const err = new Error("Failed to verify session with server.");
    expect(getAuthErrorMessage(err)).toBe("Failed to verify session with server.");
  });

  it("returns default message for Firebase-prefixed errors without known code", () => {
    const err = Object.assign(new Error("Firebase: some unknown error"), {
      code: "auth/unknown-code",
    });
    // Firebase-prefixed messages with unknown codes fall through to default
    expect(getAuthErrorMessage(err)).toBe("An unexpected error occurred. Please try again.");
  });

  it("returns default message for non-Error values", () => {
    expect(getAuthErrorMessage("string error")).toBe(
      "An unexpected error occurred. Please try again."
    );
  });

  it("returns default message for null", () => {
    expect(getAuthErrorMessage(null)).toBe("An unexpected error occurred. Please try again.");
  });

  it("returns default message for Error with empty message and Firebase prefix", () => {
    const err = Object.assign(new Error(""), { code: "auth/unknown-code" });
    expect(getAuthErrorMessage(err)).toBe("An unexpected error occurred. Please try again.");
  });
});
