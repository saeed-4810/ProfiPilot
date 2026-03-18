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
        "auth/weak-password": "Password is too weak. Use at least 6 characters.",
        "auth/invalid-email": "Please enter a valid email address.",
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
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: mockReload },
    writable: true,
  });
});

const mockReload = vi.fn();

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
/* P-PERF-124-001: New user creates account → redirect to /dashboard   */
/* ================================================================== */

describe("P-PERF-124-001: New user creates account with valid email and password", () => {
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
      expect(screen.getByText("Account created. Redirecting to dashboard...")).toBeInTheDocument();
    });
  });

  it("shows error after 5s if redirect does not complete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-success")).toBeInTheDocument();
    });

    vi.advanceTimersByTime(5100);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Redirect failed");
      expect(screen.getByTestId("signup-retry")).toBeInTheDocument();
      expect(screen.getByTestId("signup-form")).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("redirects to /dashboard if user is already authenticated", () => {
    mockUser = { email: "test@example.com", uid: "123" };
    render(<SignupPage />);

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});

/* ================================================================== */
/* P-PERF-124-002: Existing email → error shown                        */
/* ================================================================== */

describe("P-PERF-124-002: User attempts signup with existing email", () => {
  it("shows error for email-already-in-use", async () => {
    const err = Object.assign(new Error("Firebase: Error"), {
      code: "auth/email-already-in-use",
    });
    mockSignUp.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "existing@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An account with this email already exists."
      );
    });
  });
});

/* ================================================================== */
/* P-PERF-124-003: Weak password → error shown                         */
/* ================================================================== */

describe("P-PERF-124-003: User attempts signup with weak password", () => {
  it("shows error for weak-password from Firebase", async () => {
    const err = Object.assign(new Error("Firebase: Error"), {
      code: "auth/weak-password",
    });
    mockSignUp.mockRejectedValue(err);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Password is too weak. Use at least 6 characters."
      );
    });
  });

  it("shows client-side error for password under 8 characters", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "short", "short");

    await waitFor(() => {
      expect(screen.getByTestId("signup-password-error")).toHaveTextContent(
        "Password must be at least 8 characters."
      );
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* U-PERF-124-001: Loading state on submit                             */
/* ================================================================== */

describe("U-PERF-124-001: Signup form shows loading state on submit", () => {
  it("shows spinner and disables button during signup", async () => {
    mockSignUp.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-spinner")).toBeInTheDocument();
      expect(screen.getByTestId("signup-submit")).toBeDisabled();
      expect(screen.getByTestId("signup-submit")).toHaveTextContent("Creating account...");
    });
  });

  it("disables all inputs during loading", async () => {
    mockSignUp.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-input")).toBeDisabled();
      expect(screen.getByTestId("signup-password-input")).toBeDisabled();
      expect(screen.getByTestId("signup-confirm-input")).toBeDisabled();
    });
  });
});

/* ================================================================== */
/* U-PERF-124-002: Error banner on failure                             */
/* ================================================================== */

describe("U-PERF-124-002: Signup form shows error banner on failure", () => {
  it("retry button calls window.location.reload", async () => {
    mockSignUp.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/email-already-in-use" })
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "existing@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-retry")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("signup-retry"));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("renders accessible error alert with role=alert and retry button", async () => {
    mockSignUp.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/email-already-in-use" })
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "existing@example.com", "password123", "password123");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("data-testid", "signup-error");
      expect(screen.getByTestId("signup-retry")).toBeInTheDocument();
      expect(screen.getByTestId("signup-retry")).toHaveTextContent("Try again");
    });
  });

  it("keeps form visible after error for retry", async () => {
    mockSignUp.mockRejectedValue(
      Object.assign(new Error("Firebase: Error"), { code: "auth/email-already-in-use" })
    );

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "existing@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-error")).toBeInTheDocument();
      expect(screen.getByTestId("signup-form")).toBeInTheDocument();
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

    await fillAndSubmit(user, "existing@example.com", "password123", "password123");
    await waitFor(() => {
      expect(screen.getByTestId("signup-error")).toBeInTheDocument();
    });

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

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Network error. Check your connection and try again."
      );
    });
  });

  it("shows server verification error", async () => {
    mockSignUp.mockRejectedValue(new Error("Failed to verify session with server."));

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to verify session with server.");
    });
  });

  it("shows fallback error for unknown errors", async () => {
    mockSignUp.mockRejectedValue("string error");

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again."
      );
    });
  });
});

/* ================================================================== */
/* U-PERF-124-003: Framer Motion entry animation                       */
/* ================================================================== */

describe("U-PERF-124-003: Framer Motion entry animation plays on /signup load", () => {
  it("renders within MotionWrapper", () => {
    render(<SignupPage />);

    const page = screen.getByTestId("signup-page");
    expect(page).toBeInTheDocument();
    expect(page.parentElement).toBeTruthy();
  });

  it("renders page content correctly", () => {
    render(<SignupPage />);

    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByTestId("signup-subtitle")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* T-PERF-124-001: Firebase createUserWithEmailAndPassword succeeds     */
/* ================================================================== */

describe("T-PERF-124-001: Firebase createUserWithEmailAndPassword succeeds", () => {
  it("calls signUp which internally creates account and sets session", async () => {
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "password123");

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123");
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});

/* ================================================================== */
/* T-PERF-124-002: Passwords don't match → client-side validation      */
/* ================================================================== */

describe("T-PERF-124-002: Passwords don't match → client-side validation error", () => {
  it("shows confirm password error when passwords don't match", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "different456");

    await waitFor(() => {
      expect(screen.getByTestId("signup-confirm-error")).toHaveTextContent(
        "Passwords do not match."
      );
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("sets aria-invalid on confirm password field", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "new@example.com", "password123", "different456");

    await waitFor(() => {
      const confirmInput = screen.getByTestId("signup-confirm-input");
      expect(confirmInput).toHaveAttribute("aria-invalid", "true");
      expect(confirmInput).toHaveAttribute("aria-describedby", "signup-confirm-error");
    });
  });
});

/* ================================================================== */
/* T-PERF-124-003: Missing fields → client-side validation error       */
/* ================================================================== */

describe("T-PERF-124-003: Missing fields → client-side validation error", () => {
  it("shows email error when email is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.type(screen.getByTestId("signup-confirm-input"), "password123");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toHaveTextContent("Email is required.");
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows password error when password is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-email-input"), "new@example.com");
    await user.type(screen.getByTestId("signup-confirm-input"), "something");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("signup-password-error")).toHaveTextContent(
        "Password is required."
      );
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows confirm password error when confirm is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByTestId("signup-email-input"), "new@example.com");
    await user.type(screen.getByTestId("signup-password-input"), "password123");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("signup-confirm-error")).toHaveTextContent(
        "Please confirm your password."
      );
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

  it("shows email error for invalid email format", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAndSubmit(user, "not-an-email", "password123", "password123");

    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toHaveTextContent(
        "Please enter a valid email address."
      );
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

    await user.type(screen.getByTestId("signup-email-input"), "new@example.com");
    await user.type(screen.getByTestId("signup-confirm-input"), "something");
    await user.click(screen.getByTestId("signup-submit"));

    await waitFor(() => {
      const passwordInput = screen.getByTestId("signup-password-input");
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
      expect(passwordInput).toHaveAttribute("aria-describedby", "signup-password-error");
    });
  });

  it("clears field errors on resubmit with valid data", async () => {
    mockSignUp.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SignupPage />);

    await user.click(screen.getByTestId("signup-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("signup-email-error")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("signup-email-input"), "new@example.com");
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
/* Cross-links and form structure                                      */
/* ================================================================== */

describe("Signup form structure and accessibility", () => {
  it("renders email, password, and confirm password fields with labels", () => {
    render(<SignupPage />);

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("renders submit button with correct text", () => {
    render(<SignupPage />);

    const button = screen.getByTestId("signup-submit");
    expect(button).toHaveTextContent("Create account");
    expect(button).not.toBeDisabled();
  });

  it("renders cross-link to login page", () => {
    render(<SignupPage />);

    const link = screen.getByTestId("signup-login-link");
    expect(link).toHaveTextContent("Sign in");
    expect(link).toHaveAttribute("href", "/login");
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
