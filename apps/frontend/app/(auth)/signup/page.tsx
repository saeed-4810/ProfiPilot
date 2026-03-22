"use client";

/**
 * Signup Page — Firebase Auth email/password account creation.
 *
 * Per ADR-010 session lifecycle:
 *   1. User submits email + password + confirm password
 *   2. useAuth().signUp() → Firebase createUserWithEmailAndPassword → POST /auth/verify-token
 *   3. On success → redirect to /dashboard
 *   4. On error → show accessible error banner
 *
 * 5 UX states per ADR-002:
 *   - empty: form with email/password/confirm fields
 *   - loading: spinner + disabled fields
 *   - success: redirect to /dashboard
 *   - error: error banner + retry
 *   - blocked: N/A for signup page
 *
 * Scenarios: P-PERF-137-001..003, U-PERF-137-001..005, T-PERF-137-001..003
 */

import { useState, useRef, useCallback, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { MotionWrapper } from "@/components/MotionWrapper";
import { useAuth, getAuthErrorMessage } from "@/lib/auth";
import { trackPageView, trackSignupAttempt } from "@/lib/analytics";

/* ------------------------------------------------------------------ */
/* Zod schema — client-side validation                                 */
/* ------------------------------------------------------------------ */

const SignupSchema = z
  .object({
    email: z.string().min(1, "Email is required.").email("Please enter a valid email address."),
    password: z.string().min(6, "Password must be at least 6 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states)                          */
/* ------------------------------------------------------------------ */

type PageState = "empty" | "loading" | "success" | "error";

/* ------------------------------------------------------------------ */
/* SignupPage component                                                */
/* ------------------------------------------------------------------ */

export default function SignupPage() {
  const router = useRouter();
  const { signUp, user, loading: authLoading } = useAuth();

  /* --- State --- */
  const [pageState, setPageState] = useState<PageState>("empty");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  /* --- Refs --- */
  const emailInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  /** Tracks whether a sign-up is in progress to prevent useEffect redirect race. */
  const isSigningUp = useRef(false);

  /* --- Auto-focus email on mount --- */
  useEffect(() => {
    emailInputRef.current?.focus();
    trackPageView({ route: "/signup", timestamp: Date.now() });
  }, []);

  /* --- Redirect if already authenticated (not during active sign-up) --- */
  useEffect(() => {
    if (!authLoading && user !== null && !isSigningUp.current) {
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
        confirmPassword: String(formData.get("confirmPassword")),
      };

      /* T-PERF-137-002: Client-side Zod validation */
      const parsed = SignupSchema.safeParse(raw);
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const fieldErrs = flat.fieldErrors;
        const formErrs = flat.formErrors;
        const emailErr = fieldErrs["email"]?.[0];
        const passwordErr = fieldErrs["password"]?.[0];
        const confirmErr = fieldErrs["confirmPassword"]?.[0] ?? formErrs[0];
        const errors: { email?: string; password?: string; confirmPassword?: string } = {};
        if (emailErr !== undefined) {
          errors.email = emailErr;
        }
        if (passwordErr !== undefined) {
          errors.password = passwordErr;
        }
        if (confirmErr !== undefined) {
          errors.confirmPassword = confirmErr;
        }
        setFieldErrors(errors);
        /* Focus first field with error */
        if (emailErr !== undefined) {
          emailInputRef.current?.focus();
        }
        return;
      }

      /* U-PERF-137-001: Loading state */
      trackSignupAttempt({ method: "email", timestamp: Date.now() });
      setPageState("loading");
      isSigningUp.current = true;

      try {
        /* P-PERF-138-001: Create account and send verification email (ADR-028) */
        await signUp(parsed.data.email, parsed.data.password);

        /* Success — redirect to /verify-email (no session cookie — email must be verified first) */
        isSigningUp.current = false;
        setPageState("success");
        router.push("/verify-email");
      } catch (err: unknown) {
        /* P-PERF-137-002: Existing email → error shown */
        /* U-PERF-137-002: Error banner with role="alert" */
        isSigningUp.current = false;
        const message = getAuthErrorMessage(err);
        setError(message);
        setPageState("error");
        setTimeout(() => errorRef.current?.focus(), 50);
      }
    },
    [signUp, router]
  );

  /* --- Derived state --- */
  const isLoading = pageState === "loading";
  const hasEmailError = fieldErrors.email !== undefined;
  const hasPasswordError = fieldErrors.password !== undefined;
  const hasConfirmError = fieldErrors.confirmPassword !== undefined;

  return (
    <MotionWrapper>
      <main
        data-testid="signup-page"
        className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-950 text-neutral-50"
      >
        <div className="w-full max-w-md">
          {/* copy: signup-heading */}
          <h1 className="text-3xl font-bold mb-2 text-center">Create your account</h1>
          {/* copy: signup-subtitle */}
          <p data-testid="signup-subtitle" className="text-neutral-400 text-sm text-center mb-6">
            Sign up to start auditing your web performance.
          </p>

          {/* U-PERF-137-002: Error banner — general errors (not field-level) */}
          {pageState === "error" && error !== null && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              data-testid="signup-error"
              className="mb-4 p-3 rounded bg-red-900/50 border border-red-500 text-red-200 text-sm"
            >
              {error}
            </div>
          )}

          {/* Success state — brief confirmation before redirect */}
          {pageState === "success" && (
            <div
              data-testid="signup-success"
              role="status"
              className="flex flex-col items-center gap-4 mt-6"
            >
              <p className="text-green-400 text-sm font-medium">
                {/* copy: signup-success-verify */}
                Account created! Check your email to verify your address.
              </p>
            </div>
          )}

          {/* Signup form — visible in empty, error, and loading states */}
          {pageState !== "success" && (
            <form onSubmit={handleSubmit} noValidate data-testid="signup-form">
              {/* Email field */}
              <div className="mb-4">
                <label
                  htmlFor="signup-email"
                  className="block text-sm font-medium text-neutral-300 mb-1"
                >
                  Email
                </label>
                <input
                  ref={emailInputRef}
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-invalid={hasEmailError ? "true" : undefined}
                  aria-describedby={hasEmailError ? "signup-email-error" : undefined}
                  disabled={isLoading}
                  data-testid="signup-email-input"
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="you@example.com"
                />
                {hasEmailError && (
                  <p
                    id="signup-email-error"
                    data-testid="signup-email-error"
                    className="mt-1 text-sm text-red-400"
                  >
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div className="mb-4">
                <label
                  htmlFor="signup-password"
                  className="block text-sm font-medium text-neutral-300 mb-1"
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-invalid={hasPasswordError ? "true" : undefined}
                  aria-describedby={hasPasswordError ? "signup-password-error" : undefined}
                  disabled={isLoading}
                  data-testid="signup-password-input"
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="At least 6 characters"
                />
                {hasPasswordError && (
                  <p
                    id="signup-password-error"
                    data-testid="signup-password-error"
                    className="mt-1 text-sm text-red-400"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Confirm password field */}
              <div className="mb-6">
                <label
                  htmlFor="signup-confirm-password"
                  className="block text-sm font-medium text-neutral-300 mb-1"
                >
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-invalid={hasConfirmError ? "true" : undefined}
                  aria-describedby={hasConfirmError ? "signup-confirm-error" : undefined}
                  disabled={isLoading}
                  data-testid="signup-confirm-input"
                  className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="Re-enter your password"
                />
                {hasConfirmError && (
                  <p
                    id="signup-confirm-error"
                    data-testid="signup-confirm-error"
                    className="mt-1 text-sm text-red-400"
                  >
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                data-testid="signup-submit"
                className="w-full py-2 px-4 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {/* U-PERF-137-001: Spinner visible during loading */}
                {isLoading && (
                  <span
                    data-testid="signup-spinner"
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden="true"
                  />
                )}
                {isLoading ? "Creating account..." : "Create account"}
              </button>

              {/* P-PERF-137-003: Link to login page */}
              <p className="mt-4 text-center text-sm text-neutral-400">
                {/* copy: signup-login-link */}
                Already have an account?{" "}
                <Link
                  href="/login"
                  data-testid="signup-login-link"
                  className="text-blue-400 hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
                >
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}
