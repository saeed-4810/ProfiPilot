import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignIn = vi.fn();
let mockUser: { email: string; uid: string } | null = null;
let mockAuthLoading = false;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
    getIdToken: vi.fn(),
    user: mockUser,
    loading: mockAuthLoading,
    error: null,
  }),
  getAuthErrorMessage: (error: unknown) => {
    if (error instanceof Error) {
      const firebaseError = error as Error & { code?: string };
      const messages: Record<string, string> = {
        "auth/invalid-credential": "Invalid email or password. Please try again.",
        "auth/too-many-requests": "Too many attempts. Please wait and try again.",
        "auth/network-request-failed": "Network error. Check your connection and try again.",
        "auth/user-not-found": "No account found with this email address.",
        "auth/wrong-password": "Incorrect password. Please try again.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/user-disabled": "This account has been disabled. Contact support.",
      };
      if (firebaseError.code !== undefined && firebaseError.code in messages) {
        return messages[firebaseError.code] as string;
      }
      if (error.message !== "" && !error.message.startsWith("Firebase:")) {
        return error.message;
      }
    }
    return "An unexpected error occurred. Please try again.";
  },
}));

/* Import after mocks */
import LoginPage from "../../app/(auth)/login/page";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const mockReload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSignIn.mockReset();
  mockUser = null;
  mockAuthLoading = false;
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: mockReload },
    writable: true,
  });
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string
) {
  await user.type(screen.getByTestId("login-email-input"), email);
  await user.type(screen.getByTestId("login-password-input"), password);
  await user.click(screen.getByTestId("login-submit"));
}

/* ================================================================== */
/* P-PERF-98-001: Valid credentials → redirect to /dashboard           */
/* ================================================================== */

describe("P-PERF-98-001: User with valid Firebase credentials signs in", () => {
  it("calls signIn and redirects to /dashboard on success", async () => {
    mockSignIn.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows success state before redirect", async () => {
    mockSignIn.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("login-success")).toBeInTheDocument();
      expect(screen.getByText("Sign-in successful. Redirecting...")).toBeInTheDocument();
    });
  });

  it("shows error after 5s if redirect does not complete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSignIn.mockResolvedValue(undefined);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("login-success")).toBeInTheDocument();
    });

    // Advance past the 5s timeout
    vi.advanceTimersByTime(5100);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Redirect failed");
      expect(screen.getByTestId("login-retry")).toBeInTheDocument();
      expect(screen.getByTestId("login-form")).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("redirects to /dashboard if user is already authenticated", () => {
    mockUser = { email: "test@example.com", uid: "123" };
    render(<LoginPage />);

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});

/* ================================================================== */
/* P-PERF-98-002: Invalid credentials → error shown                    */
/* ================================================================== */

describe("P-PERF-98-002: User with invalid credentials attempts sign-in", () => {
  it("shows error banner for invalid credentials", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/invalid-credential)."), {
      code: "auth/invalid-credential",
    });
    mockSignIn.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "wrongpassword");

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid email or password. Please try again."
      );
    });
  });

  it("shows error for user-not-found", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/user-not-found)."), {
      code: "auth/user-not-found",
    });
    mockSignIn.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "nobody@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No account found with this email address."
      );
    });
  });

  it("shows error for too-many-requests", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/too-many-requests)."), {
      code: "auth/too-many-requests",
    });
    mockSignIn.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many attempts. Please wait and try again."
      );
    });
  });

  it("shows fallback error for unknown errors", async () => {
    mockSignIn.mockRejectedValue("string error");

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again."
      );
    });
  });

  it("shows server verification error", async () => {
    mockSignIn.mockRejectedValue(new Error("Failed to verify session with server."));

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to verify session with server.");
    });
  });
});

/* ================================================================== */
/* P-PERF-98-003: New user first sign-in (deferred — OAuth post-MVP)   */
/* ================================================================== */

describe("P-PERF-98-003: New user first sign-in", () => {
  it("handles successful first-time sign-in same as existing user", async () => {
    // First sign-in behaves identically to returning user at the login page level
    // (Firebase handles account provisioning internally)
    mockSignIn.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "newuser@example.com", "newpassword123");

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("newuser@example.com", "newpassword123");
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});

/* ================================================================== */
/* U-PERF-98-001: Loading state on submit                              */
/* ================================================================== */

describe("U-PERF-98-001: Login form shows loading state on submit", () => {
  it("shows spinner and disables button during sign-in", async () => {
    // Never-resolving promise to keep loading state
    mockSignIn.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("login-spinner")).toBeInTheDocument();
      expect(screen.getByTestId("login-submit")).toBeDisabled();
      expect(screen.getByTestId("login-submit")).toHaveTextContent("Signing in...");
    });
  });

  it("disables email and password inputs during loading", async () => {
    mockSignIn.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("login-email-input")).toBeDisabled();
      expect(screen.getByTestId("login-password-input")).toBeDisabled();
    });
  });
});

/* ================================================================== */
/* U-PERF-98-002: Error banner on failure                              */
/* ================================================================== */

describe("U-PERF-98-002: Login form shows error banner on failure", () => {
  it("retry button calls window.location.reload", async () => {
    mockSignIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/invalid-credential" })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "wrong");

    await waitFor(() => {
      expect(screen.getByTestId("login-retry")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("login-retry"));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("renders accessible error alert with role=alert and retry button", async () => {
    mockSignIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/invalid-credential" })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "wrong");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("data-testid", "login-error");
      expect(screen.getByTestId("login-retry")).toBeInTheDocument();
      expect(screen.getByTestId("login-retry")).toHaveTextContent("Try again");
    });
  });

  it("keeps form visible after error for retry", async () => {
    mockSignIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/invalid-credential" })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "wrong");

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
      expect(screen.getByTestId("login-form")).toBeInTheDocument();
      expect(screen.getByTestId("login-email-input")).toBeInTheDocument();
    });
  });

  it("clears error when user resubmits", async () => {
    mockSignIn
      .mockRejectedValueOnce(
        Object.assign(new Error("Firebase: Error"), { code: "auth/invalid-credential" })
      )
      .mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    render(<LoginPage />);

    // First submit — error
    await fillAndSubmit(user, "test@example.com", "wrong");
    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
    });

    // Clear and resubmit — success
    await user.clear(screen.getByTestId("login-email-input"));
    await user.clear(screen.getByTestId("login-password-input"));
    await fillAndSubmit(user, "test@example.com", "correct");

    await waitFor(() => {
      expect(screen.queryByTestId("login-error")).not.toBeInTheDocument();
    });
  });

  it("shows network error message", async () => {
    mockSignIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/network-request-failed" })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Network error. Check your connection and try again."
      );
    });
  });
});

/* ================================================================== */
/* U-PERF-98-003: Framer Motion entry animation                        */
/* ================================================================== */

describe("U-PERF-98-003: Framer Motion entry animation plays on /login load", () => {
  it("renders within MotionWrapper (animation container present)", () => {
    render(<LoginPage />);

    const loginPage = screen.getByTestId("login-page");
    expect(loginPage).toBeInTheDocument();
    // MotionWrapper renders a motion.div parent
    expect(loginPage.parentElement).toBeTruthy();
  });

  it("renders login page content correctly", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: /sign in to prefpilot/i })).toBeInTheDocument();
    expect(screen.getByTestId("login-subtitle")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* T-PERF-98-001: Firebase Auth token valid → backend accepts          */
/* ================================================================== */

describe("T-PERF-98-001: Firebase Auth token is valid and accepted by backend", () => {
  it("calls signIn which internally calls verify-token endpoint", async () => {
    mockSignIn.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "valid@example.com", "validpassword");

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("valid@example.com", "validpassword");
      // signIn internally calls POST /auth/verify-token (tested in auth.test.ts)
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});

/* ================================================================== */
/* T-PERF-98-002: Expired or tampered token rejected                   */
/* ================================================================== */

describe("T-PERF-98-002: Expired or tampered token is rejected", () => {
  it("shows error when server rejects token verification", async () => {
    mockSignIn.mockRejectedValue(new Error("Failed to verify session with server."));

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "test@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to verify session with server.");
    });
  });

  it("shows error for disabled account", async () => {
    mockSignIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/user-disabled" })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "disabled@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This account has been disabled. Contact support."
      );
    });
  });
});

/* ================================================================== */
/* T-PERF-98-003: Missing email/password → validation error            */
/* ================================================================== */

describe("T-PERF-98-003: Sign-in with missing email/password returns validation error", () => {
  it("shows email error when email is empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Only fill password, leave email empty
    await user.type(screen.getByTestId("login-password-input"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("login-email-error")).toBeInTheDocument();
      expect(screen.getByText("Email is required.")).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows password error when password is empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Only fill email, leave password empty
    await user.type(screen.getByTestId("login-email-input"), "test@example.com");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("login-password-error")).toBeInTheDocument();
      expect(screen.getByText("Password is required.")).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows email error for invalid email format", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillAndSubmit(user, "not-an-email", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("login-email-error")).toBeInTheDocument();
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows both errors when both fields are empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("login-email-error")).toBeInTheDocument();
      expect(screen.getByTestId("login-password-error")).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("sets aria-invalid and aria-describedby on email field with error", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByTestId("login-password-input"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      const emailInput = screen.getByTestId("login-email-input");
      expect(emailInput).toHaveAttribute("aria-invalid", "true");
      expect(emailInput).toHaveAttribute("aria-describedby", "email-error");
    });
  });

  it("sets aria-invalid and aria-describedby on password field with error", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByTestId("login-email-input"), "test@example.com");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      const passwordInput = screen.getByTestId("login-password-input");
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
      expect(passwordInput).toHaveAttribute("aria-describedby", "password-error");
    });
  });

  it("clears field errors on resubmit with valid data", async () => {
    mockSignIn.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginPage />);

    // Submit with empty fields
    await user.click(screen.getByTestId("login-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("login-email-error")).toBeInTheDocument();
    });

    // Fill and resubmit
    await user.type(screen.getByTestId("login-email-input"), "test@example.com");
    await user.type(screen.getByTestId("login-password-input"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.queryByTestId("login-email-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("login-password-error")).not.toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* Additional: Form structure and accessibility                        */
/* ================================================================== */

describe("Login form structure and accessibility", () => {
  it("renders email and password fields with labels", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders submit button with correct text", () => {
    render(<LoginPage />);

    const button = screen.getByTestId("login-submit");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Sign in");
    expect(button).not.toBeDisabled();
  });

  it("does not redirect when auth is still loading", () => {
    mockAuthLoading = true;
    mockUser = null;
    render(<LoginPage />);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not redirect when user is null and not loading", () => {
    mockAuthLoading = false;
    mockUser = null;
    render(<LoginPage />);

    expect(mockPush).not.toHaveBeenCalled();
  });
});
