import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/analytics", () => ({
  trackPageView: vi.fn(),
  trackEmailVerificationSent: vi.fn(),
}));

const mockSendEmailVerification = vi.fn();
let mockCurrentUser: { email: string } | null = null;

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: mockCurrentUser }),
  sendEmailVerification: (...args: unknown[]) => mockSendEmailVerification(...args),
}));

/* Import after mocks */
import VerifyEmailPage from "../../app/(auth)/verify-email/page";

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmailVerification.mockReset();
  mockCurrentUser = null;
});

/* ================================================================== */
/* U-PERF-138-001: /verify-email page shows "Check your email"         */
/* ================================================================== */

describe("U-PERF-138-001: /verify-email page shows check your email with resend button", () => {
  it("renders heading and subtitle", () => {
    render(<VerifyEmailPage />);

    expect(screen.getByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByTestId("verify-email-subtitle")).toBeInTheDocument();
    expect(screen.getByTestId("verify-email-subtitle")).toHaveTextContent(/verification link/i);
  });

  it("renders resend button", () => {
    render(<VerifyEmailPage />);

    const button = screen.getByTestId("verify-email-resend");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Resend verification email");
    expect(button).not.toBeDisabled();
  });

  it("renders sign in link", () => {
    render(<VerifyEmailPage />);

    const link = screen.getByTestId("verify-email-login-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveTextContent("Sign in");
  });

  it("renders verify-email-page testid", () => {
    render(<VerifyEmailPage />);

    expect(screen.getByTestId("verify-email-page")).toBeInTheDocument();
  });
});

/* ================================================================== */
/* U-PERF-138-002: Resend button shows loading and success             */
/* ================================================================== */

describe("U-PERF-138-002: Resend button shows loading state and success confirmation", () => {
  it("shows spinner and disables button during resend", async () => {
    mockCurrentUser = { email: "test@example.com" };
    mockSendEmailVerification.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(screen.getByTestId("verify-email-spinner")).toBeInTheDocument();
      expect(screen.getByTestId("verify-email-resend")).toBeDisabled();
      expect(screen.getByTestId("verify-email-resend")).toHaveTextContent("Sending...");
    });
  });

  it("shows success message after resend", async () => {
    mockCurrentUser = { email: "test@example.com" };
    mockSendEmailVerification.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(screen.getByTestId("verify-email-success")).toBeInTheDocument();
      expect(screen.getByTestId("verify-email-success")).toHaveTextContent(
        "Verification email sent!"
      );
    });
  });

  it("shows error when no user is signed in", async () => {
    mockCurrentUser = null;

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(screen.getByTestId("verify-email-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/sign in first/i);
    });
  });

  it("shows error when sendEmailVerification fails", async () => {
    mockCurrentUser = { email: "test@example.com" };
    mockSendEmailVerification.mockRejectedValue(new Error("Too many requests"));

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(screen.getByTestId("verify-email-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Too many requests");
    });
  });

  it("shows fallback error for non-Error thrown", async () => {
    mockCurrentUser = { email: "test@example.com" };
    mockSendEmailVerification.mockRejectedValue("string error");

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(screen.getByTestId("verify-email-error")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to send verification email.");
    });
  });
});

/* ================================================================== */
/* T-PERF-138-003: Resend calls sendEmailVerification                  */
/* ================================================================== */

describe("T-PERF-138-003: Resend calls sendEmailVerification on auth.currentUser", () => {
  it("calls sendEmailVerification with the current user", async () => {
    mockCurrentUser = { email: "test@example.com" };
    mockSendEmailVerification.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(mockSendEmailVerification).toHaveBeenCalledWith(mockCurrentUser, {
        url: "http://localhost:3000/login",
        handleCodeInApp: false,
      });
    });
  });

  it("uses NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN for actionCodeSettings when set", async () => {
    const originalEnv = process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"];
    process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] = "prefpilot-stage.firebaseapp.com";

    mockCurrentUser = { email: "domain@example.com" };
    mockSendEmailVerification.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<VerifyEmailPage />);

    await user.click(screen.getByTestId("verify-email-resend"));

    await waitFor(() => {
      expect(mockSendEmailVerification).toHaveBeenCalledWith(mockCurrentUser, {
        url: "https://prefpilot-stage.firebaseapp.com/login",
        handleCodeInApp: false,
      });
    });

    // Restore env
    if (originalEnv === undefined) {
      delete process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"];
    } else {
      process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] = originalEnv;
    }
  });
});
