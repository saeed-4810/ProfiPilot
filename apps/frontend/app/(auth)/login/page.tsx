"use client";

/**
 * Login Page — Firebase Auth email/password sign-in.
 *
 * Per ADR-010 session lifecycle:
 *   1. User submits email + password
 *   2. useAuth().signIn() → Firebase signInWithEmailAndPassword → POST /auth/verify-token
 *   3. On success → redirect to /dashboard
 *   4. On error → show accessible error banner
 *
 * 5 UX states per ADR-002:
 *   - empty: form with email/password fields
 *   - loading: spinner + disabled fields
 *   - success: redirect to /dashboard
 *   - error: error banner + retry
 *   - blocked: N/A for login page
 *
 * Scenarios: P-PERF-98-001..003, U-PERF-98-001..003, T-PERF-98-001..003
 */

import { useState, useRef, useCallback, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { MotionWrapper } from "@/components/MotionWrapper";
import { useAuth, getAuthErrorMessage } from "@/lib/auth";
import {
  trackPageView,
  trackLoginAttempt,
  trackEmailVerificationBlocked,
  trackGoogleSigninAttempt,
  trackGoogleSigninSuccess,
  trackGoogleSigninError,
} from "@/lib/analytics";

/* ------------------------------------------------------------------ */
/* Zod schema — client-side validation                                 */
/* ------------------------------------------------------------------ */

const LoginSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states)                          */
/* ------------------------------------------------------------------ */

type PageState = "empty" | "loading" | "success" | "error";

/* ------------------------------------------------------------------ */
/* LoginPage component                                                 */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithGoogle, user, loading: authLoading } = useAuth();

  /* --- State --- */
  const [pageState, setPageState] = useState<PageState>("empty");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  /** U-PERF-138-003: Track if error is specifically email-not-verified */
  const [isEmailNotVerified, setIsEmailNotVerified] = useState(false);

  /* --- Refs --- */
  const emailInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  /** Tracks whether a sign-in is in progress to prevent useEffect redirect race. */
  const isSigningIn = useRef(false);

  /* --- Auto-focus email on mount --- */
  useEffect(() => {
    emailInputRef.current?.focus();
    trackPageView({ route: "/login", timestamp: Date.now() });
  }, []);

  /* --- Redirect if already authenticated (not during active sign-in) --- */
  useEffect(() => {
    if (!authLoading && user !== null && !isSigningIn.current) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  /* --- Form submission --- */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setFieldErrors({});

      const formData = new FormData(e.currentTarget);
      const raw = {
        email: String(formData.get("email")),
        password: String(formData.get("password")),
      };

      /* T-PERF-98-003: Client-side Zod validation */
      const parsed = LoginSchema.safeParse(raw);
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const emailErr = flat["email"]?.[0];
        const passwordErr = flat["password"]?.[0];
        const errors: { email?: string; password?: string } = {};
        if (emailErr !== undefined) {
          errors.email = emailErr;
        }
        if (passwordErr !== undefined) {
          errors.password = passwordErr;
        }
        setFieldErrors(errors);
        /* Focus first field with error */
        if (flat["email"] !== undefined) {
          emailInputRef.current?.focus();
        }
        return;
      }

      /* U-PERF-98-001: Loading state */
      trackLoginAttempt({ method: "email", timestamp: Date.now() });
      setPageState("loading");
      isSigningIn.current = true;

      try {
        /* P-PERF-98-001: Sign in with valid credentials */
        await signIn(parsed.data.email, parsed.data.password);

        /* Success — redirect to dashboard (cookie is now set) */
        isSigningIn.current = false;
        setPageState("success");
        router.push("/dashboard");
      } catch (err: unknown) {
        /* P-PERF-98-002: Invalid credentials → error shown */
        /* U-PERF-98-002: Error banner with role="alert" */
        /* U-PERF-138-003: Detect email-not-verified error for specific UX */
        isSigningIn.current = false;
        const firebaseErr = err as Error & { code?: string };
        const emailNotVerified = firebaseErr.code === "auth/email-not-verified";
        setIsEmailNotVerified(emailNotVerified);
        if (emailNotVerified) {
          trackEmailVerificationBlocked({ timestamp: Date.now() });
        }
        const message = getAuthErrorMessage(err);
        setError(message);
        setPageState("error");
        setTimeout(() => errorRef.current?.focus(), 50);
      }
    },
    [signIn, router]
  );

  /* --- Google Sign-In handler (PERF-139) --- */
  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setIsEmailNotVerified(false);
    trackGoogleSigninAttempt({ timestamp: Date.now() });
    setPageState("loading");
    isSigningIn.current = true;

    try {
      await signInWithGoogle();
      trackGoogleSigninSuccess({ timestamp: Date.now() });
      isSigningIn.current = false;
      setPageState("success");
      router.push("/dashboard");
    } catch (err: unknown) {
      isSigningIn.current = false;
      const firebaseErr = err as Error & { code?: string };
      // Silent errors (user closed popup) — signInWithGoogle already handles these
      if (
        firebaseErr.code === "auth/popup-closed-by-user" ||
        firebaseErr.code === "auth/cancelled-popup-request"
      ) {
        setPageState("empty");
        return;
      }
      trackGoogleSigninError({
        error_code: firebaseErr.code ?? "unknown",
        timestamp: Date.now(),
      });
      const message = getAuthErrorMessage(err);
      setError(message);
      setPageState("error");
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [signInWithGoogle, router]);

  /* --- Derived state --- */
  const isLoading = pageState === "loading";
  const hasEmailError = fieldErrors.email !== undefined;
  const hasPasswordError = fieldErrors.password !== undefined;

  return (
    <MotionWrapper>
      <main
        data-testid="login-page"
        className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-950 text-neutral-50"
      >
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2 text-center">Sign in to PrefPilot</h1>
          <p data-testid="login-subtitle" className="text-neutral-400 text-sm text-center mb-6">
            Enter your credentials to access your dashboard.
          </p>

          {/* U-PERF-98-002: Error banner — general errors (not field-level) */}
          {pageState === "error" && error !== null && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              data-testid="login-error"
              className="mb-4 p-3 rounded bg-red-900/50 border border-red-500 text-red-200 text-sm"
            >
              {error}
              {/* U-PERF-138-003: Show verify-email link when email is not verified */}
              {isEmailNotVerified && (
                <p className="mt-2">
                  <Link
                    href="/verify-email"
                    data-testid="login-verify-email-link"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Resend verification email
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* Success state — brief confirmation before redirect */}
          {pageState === "success" && (
            <div
              data-testid="login-success"
              role="status"
              className="flex flex-col items-center gap-4 mt-6"
            >
              <p className="text-green-400 text-sm font-medium">
                Sign-in successful. Redirecting...
              </p>
            </div>
          )}

          {/* Login form — visible in empty, error, and loading states */}
          {pageState !== "success" && (
            <>
              {/* U-PERF-139-001: Google Sign-In button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                data-testid="google-signin-btn"
                className="w-full py-2 px-4 rounded border border-neutral-700 bg-neutral-800 text-neutral-50 font-medium hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 mb-4">
                <hr className="flex-1 border-neutral-700" />
                <span className="text-neutral-500 text-sm">or</span>
                <hr className="flex-1 border-neutral-700" />
              </div>

              <form onSubmit={handleSubmit} noValidate data-testid="login-form">
                {/* Email field */}
                <div className="mb-4">
                  <label
                    htmlFor="login-email"
                    className="block text-sm font-medium text-neutral-300 mb-1"
                  >
                    Email
                  </label>
                  <input
                    ref={emailInputRef}
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-invalid={hasEmailError ? "true" : undefined}
                    aria-describedby={hasEmailError ? "email-error" : undefined}
                    disabled={isLoading}
                    data-testid="login-email-input"
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    placeholder="you@example.com"
                  />
                  {hasEmailError && (
                    <p
                      id="email-error"
                      data-testid="login-email-error"
                      className="mt-1 text-sm text-red-400"
                    >
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                {/* Password field */}
                <div className="mb-6">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-neutral-300 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-invalid={hasPasswordError ? "true" : undefined}
                    aria-describedby={hasPasswordError ? "password-error" : undefined}
                    disabled={isLoading}
                    data-testid="login-password-input"
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    placeholder="Enter your password"
                  />
                  {hasPasswordError && (
                    <p
                      id="password-error"
                      data-testid="login-password-error"
                      className="mt-1 text-sm text-red-400"
                    >
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  data-testid="login-submit"
                  className="w-full py-2 px-4 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {/* U-PERF-98-001: Spinner visible during loading */}
                  {isLoading && (
                    <span
                      data-testid="login-spinner"
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden="true"
                    />
                  )}
                  {isLoading ? "Signing in..." : "Sign in"}
                </button>

                {/* P-PERF-137-003: Link to signup page */}
                <p className="mt-4 text-center text-sm text-neutral-400">
                  {/* copy: login-signup-link */}
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    data-testid="login-signup-link"
                    className="text-blue-400 hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
                  >
                    Create one
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}
