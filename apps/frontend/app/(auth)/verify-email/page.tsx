"use client";

/**
 * Verify Email Page — prompts user to check their email after signup.
 *
 * Per ADR-028 email verification flow:
 *   1. User signs up → sendEmailVerification → redirect here
 *   2. Page shows "Check your email" message
 *   3. Resend button calls sendEmailVerification again
 *   4. "Back to sign in" link navigates to /login
 *
 * 4 UX states per ADR-002:
 *   - empty: "Check your email" message + resend button
 *   - loading: resend button shows spinner
 *   - success: "Verification email sent!" confirmation
 *   - error: "Failed to send" error banner
 *
 * Scenarios: P-PERF-138-001, U-PERF-138-001..002, T-PERF-138-003, E-AUTH-009..010
 */

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { MotionWrapper } from "@/components/MotionWrapper";
import { trackPageView, trackEmailVerificationSent } from "@/lib/analytics";

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002                                        */
/* ------------------------------------------------------------------ */

type PageState = "empty" | "loading" | "success" | "error";

/* ------------------------------------------------------------------ */
/* VerifyEmailPage component                                           */
/* ------------------------------------------------------------------ */

export default function VerifyEmailPage() {
  const [pageState, setPageState] = useState<PageState>("empty");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackPageView({ route: "/verify-email", timestamp: Date.now() });
  }, []);

  /* --- Resend verification email --- */
  const handleResend = useCallback(async () => {
    setPageState("loading");
    setError(null);

    try {
      // Import Firebase auth dynamically to avoid SSR issues
      const { getAuth, sendEmailVerification } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (currentUser === null) {
        // User is signed out (expected after signup per ADR-028)
        // Show a message to sign in first, then resend from login page
        setError("Please sign in first, then request a new verification email.");
        setPageState("error");
        return;
      }

      const authDomain = process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] ?? "";
      const baseUrl = authDomain !== "" ? `https://${authDomain}` : window.location.origin;

      await sendEmailVerification(currentUser, {
        url: `${baseUrl}/login`,
        handleCodeInApp: false,
      });
      trackEmailVerificationSent({ method: "resend", timestamp: Date.now() });
      setPageState("success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send verification email.";
      setError(message);
      setPageState("error");
    }
  }, []);

  const isLoading = pageState === "loading";

  return (
    <MotionWrapper>
      <main
        data-testid="verify-email-page"
        className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-950 text-neutral-50"
      >
        <div className="w-full max-w-md text-center">
          {/* Icon */}
          <div className="mb-6">
            <span className="inline-block text-5xl" aria-hidden="true">
              &#9993;
            </span>
          </div>

          {/* copy: verify-email-heading */}
          <h1 className="text-3xl font-bold mb-2">Check your email</h1>

          {/* copy: verify-email-subtitle */}
          <p data-testid="verify-email-subtitle" className="text-neutral-400 text-sm mb-6">
            We sent a verification link to your email address. Click the link to verify your
            account, then come back to sign in.
          </p>

          {/* U-PERF-138-002: Success confirmation after resend */}
          {pageState === "success" && (
            <div
              data-testid="verify-email-success"
              role="status"
              className="mb-4 p-3 rounded bg-green-900/50 border border-green-500 text-green-200 text-sm"
            >
              Verification email sent! Check your inbox.
            </div>
          )}

          {/* Error banner */}
          {pageState === "error" && error !== null && (
            <div
              data-testid="verify-email-error"
              role="alert"
              className="mb-4 p-3 rounded bg-red-900/50 border border-red-500 text-red-200 text-sm"
            >
              {error}
            </div>
          )}

          {/* U-PERF-138-002: Resend button */}
          <button
            type="button"
            onClick={handleResend}
            disabled={isLoading}
            data-testid="verify-email-resend"
            className="w-full py-2 px-4 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
          >
            {isLoading && (
              <span
                data-testid="verify-email-spinner"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden="true"
              />
            )}
            {isLoading ? "Sending..." : "Resend verification email"}
          </button>

          {/* Back to sign in link */}
          <p className="text-sm text-neutral-400">
            Already verified?{" "}
            <Link
              href="/login"
              data-testid="verify-email-login-link"
              className="text-blue-400 hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </MotionWrapper>
  );
}
