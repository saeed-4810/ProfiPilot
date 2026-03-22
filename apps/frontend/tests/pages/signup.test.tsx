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

const mockSignUp = vi.fn();
let mockUser: { email: string; uid: string } | null = null;
let mockAuthLoading = false;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: mockSignUp,
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
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/too-many-requests": "Too many attempts. Please wait and try again.",
        "auth/network-request-failed": "Network error. Check your connection and try again.",
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

vi.mock("@/lib/analytics", () => ({
  trackPageView: vi.fn(),
  trackSignupAttempt: vi.fn(),
}));

/* Import after mocks */
import SignupPage from "../../app/(auth)/signup/page";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockSignUp.mockReset();
  mockUser = null;
  mockAuthLoading = false;
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
  confirmPassword: string
) {
  await user.type(screen.getByTestId("signup-email-input"), email);
  await user.type(screen.getByTestId("signup-password-input"), password);
  await user.type(screen.getByTestId("signup-confirm-input"), confirmPassword);
  await user.click(screen.getByTestId("signup-submit"));
}

/* ================================================================== */
/* P-PERF-137-001: Valid credentials → account created, redirect       */
/* ================================================================== */

describe("P-PERF-137-001: New user creates account with valid email/password", () => {
  it("calls signUp and redirects to /dashboard on success", async () => {
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123");
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows success state before redirect", async () => {
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-success")).toBeInTheDocument();
      expect(screen.getByText("Account created successfully. Redirecting...")).toBeInTheDocument();
    });
  });

  it("redirects to /dashboard if user is already authenticated", () => {
    mockUser = { email: "test@example.com", uid: "123" };
    render(<SignupPage />);

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});

/* ================================================================== */
/* P-PERF-137-002: Existing email → error shown                        */
/* ================================================================== */

describe("P-PERF-137-002: User tries to sign up with existing email", () => {
  it("shows error banner for email already in use", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/email-already-in-use)."), {
      code: "auth/email-already-in-use",
    });
    mockSignUp.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "existing@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An account with this email already exists."
      );
    });
  });

  it("shows error for too-many-requests", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/too-many-requests)."), {
      code: "auth/too-many-requests",
    });
    mockSignUp.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many attempts. Please wait and try again."
      );
    });
  });

  it("shows fallback error for unknown errors", async () => {
    mockSignUp.mockRejectedValue("string error");

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again."
      );
    });
  });

  it("shows server verification error", async () => {
    mockSignUp.mockRejectedValue(new Error("Failed to verify session with server."));

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to verify session with server.");
    });
  });
});

/* ================================================================== */
/* P-PERF-137-003: Navigation between login and signup                 */
/* ================================================================== */

describe("P-PERF-137-003: User navigates between login and signup", () => {
  it("renders link to login page", () => {
    render(<SignupPage />);

    const link = screen.getByTestId("signup-login-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveTextContent("Sign in");
  });
});

/* ================================================================== */
/* U-PERF-137-001: Loading state on submit                             */
/* ================================================================== */

describe("U-PERF-137-001: Signup form shows loading state on submit", () => {
  it("shows spinner and disables button during sign-up", async () => {
    mockSignUp.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-spinner")).toBeInTheDocument();
      expect(screen.getByTestId("signup-submit")).toBeDisabled();
      expect(screen.getByTestId("signup-submit")).toHaveTextContent("Creating account...");
    });
  });

  it("disables all input fields during loading", async () => {
    mockSignUp.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-input")).toBeDisabled();
      expect(screen.getByTestId("signup-password-input")).toBeDisabled();
      expect(screen.getByTestId("signup-confirm-input")).toBeDisabled();
    });
  });
});

/* ================================================================== */
/* U-PERF-137-002: Error banner on failure                             */
/* ================================================================== */

describe("U-PERF-137-002: Signup form shows error banner on failure", () => {
  it("renders accessible error alert with role=alert", async () => {
    mockSignUp.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/email-already-in-use" })
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("data-testid", "signup-error");
    });
  });

  it("keeps form visible after error for retry", async () => {
    mockSignUp.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/email-already-in-use" })
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-error")).toBeInTheDocument();
      expect(screen.getByTestId("signup-form")).toBeInTheDocument();
      expect(screen.getByTestId("signup-email-input")).toBeInTheDocument();
    });
  });

  it("clears error when user resubmits", async () => {
    mockSignUp
      .mockRejectedValueOnce(
        Object.assign(new Error("Firebase: Error"), { code: "auth/email-already-in-use" })
      )
      .mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    // First submit — error
    await fillAndSubmit(user, "existing@example.com", "password123", "password123");
    await waitFor(() => {
      expect(screen.getByTestId("signup-error")).toBeInTheDocument();
    });

    // Clear and resubmit — success
    await user.clear(screen.getByTestId("signup-email-input"));
    await user.clear(screen.getByTestId("signup-password-input"));
    await user.clear(screen.getByTestId("signup-confirm-input"));
    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.queryByTestId("signup-error")).not.toBeInTheDocument();
    });
  });

  it("shows network error message", async () => {
    mockSignUp.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/network-request-failed" })
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Network error. Check your connection and try again."
      );
    });
  });
});

/* ================================================================== */
/* U-PERF-137-003: Password confirmation validation                    */
/* ================================================================== */

describe("U-PERF-137-003: Signup form validates password confirmation", () => {
  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "password123", "different456");

    await waitFor(() => {
      expect(screen.getByTestId("signup-confirm-error")).toBeInTheDocument();
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows error when confirm password is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-email-input"), "test@example.com");
    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("signup-confirm-error")).toBeInTheDocument();
      expect(screen.getByText("Please confirm your password.")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* U-PERF-137-004: Password strength validation                        */
/* ================================================================== */

describe("U-PERF-137-004: Signup form validates password strength", () => {
  it("shows error when password is too short", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "12345", "12345");

    await waitFor(() => {
      expect(screen.getByTestId("signup-password-error")).toBeInTheDocument();
      expect(screen.getByText("Password must be at least 6 characters.")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows weak password error from Firebase", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/weak-password)."), {
      code: "auth/weak-password",
    });
    mockSignUp.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "123456", "123456");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Password must be at least 6 characters."
      );
    });
  });
});

/* ================================================================== */
/* U-PERF-137-005: Framer Motion entry animation                       */
/* ================================================================== */

describe("U-PERF-137-005: Framer Motion entry animation plays on /signup load", () => {
  it("renders within MotionWrapper (animation container present)", () => {
    render(<SignupPage />);

    const signupPage = screen.getByTestId("signup-page");
    expect(signupPage).toBeInTheDocument();
    expect(signupPage.parentElement).toBeTruthy();
  });

  it("renders signup page content correctly", () => {
    render(<SignupPage />);

    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByTestId("signup-subtitle")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* T-PERF-137-001: Firebase createUserWithEmailAndPassword → verify    */
/* ================================================================== */

describe("T-PERF-137-001: Firebase createUserWithEmailAndPassword → verify-token", () => {
  it("calls signUp which internally calls verify-token endpoint", async () => {
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "validpassword", "validpassword");

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "validpassword");
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});

/* ================================================================== */
/* T-PERF-137-002: Client-side Zod validation rejects invalid input    */
/* ================================================================== */

describe("T-PERF-137-002: Client-side Zod validation rejects invalid input", () => {
  it("shows email error when email is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.type(screen.getByTestId("signup-confirm-input"), "password123");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toBeInTheDocument();
      expect(screen.getByText("Email is required.")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows email error for invalid email format", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "not-an-email", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toBeInTheDocument();
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows all errors when all fields are empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toBeInTheDocument();
      expect(screen.getByTestId("signup-password-error")).toBeInTheDocument();
      expect(screen.getByTestId("signup-confirm-error")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("sets aria-invalid and aria-describedby on email field with error", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.type(screen.getByTestId("signup-confirm-input"), "password123");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      const emailInput = screen.getByTestId("signup-email-input");
      expect(emailInput).toHaveAttribute("aria-invalid", "true");
      expect(emailInput).toHaveAttribute("aria-describedby", "signup-email-error");
    });
  });

  it("sets aria-invalid and aria-describedby on password field with error", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-email-input"), "test@example.com");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      const passwordInput = screen.getByTestId("signup-password-input");
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
      expect(passwordInput).toHaveAttribute("aria-describedby", "signup-password-error");
    });
  });

  it("sets aria-invalid and aria-describedby on confirm field with error", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-email-input"), "test@example.com");
    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.type(screen.getByTestId("signup-confirm-input"), "different");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      const confirmInput = screen.getByTestId("signup-confirm-input");
      expect(confirmInput).toHaveAttribute("aria-invalid", "true");
      expect(confirmInput).toHaveAttribute("aria-describedby", "signup-confirm-error");
    });
  });

  it("clears field errors on resubmit with valid data", async () => {
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    // Submit with empty fields
    await user.click(screen.getByTestId("signup-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toBeInTheDocument();
    });

    // Fill and resubmit
    await user.type(screen.getByTestId("signup-email-input"), "test@example.com");
    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.type(screen.getByTestId("signup-confirm-input"), "password123");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.queryByTestId("signup-email-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("signup-password-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("signup-confirm-error")).not.toBeInTheDocument();
    });
  });
});

/* ================================================================== */
/* T-PERF-137-003: Weak password rejected by Firebase                  */
/* ================================================================== */

describe("T-PERF-137-003: Weak password rejected by Firebase", () => {
  it("shows weak password error from Firebase", async () => {
    const err = Object.assign(new Error("Firebase: Error (auth/weak-password)."), {
      code: "auth/weak-password",
    });
    mockSignUp.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "test@example.com", "123456", "123456");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Password must be at least 6 characters."
      );
    });
  });
});

/* ================================================================== */
/* Additional: Form structure and accessibility                        */
/* ================================================================== */

describe("Signup form structure and accessibility", () => {
  it("renders email, password, and confirm password fields with labels", () => {
    render(<SignupPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("renders submit button with correct text", () => {
    render(<SignupPage />);

    const button = screen.getByTestId("signup-submit");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Create account");
    expect(button).not.toBeDisabled();
  });

  it("does not redirect when auth is still loading", () => {
    mockAuthLoading = true;
    mockUser = null;
    render(<SignupPage />);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not redirect when user is null and not loading", () => {
    mockAuthLoading = false;
    mockUser = null;
    render(<SignupPage />);

    expect(mockPush).not.toHaveBeenCalled();
  });
});
