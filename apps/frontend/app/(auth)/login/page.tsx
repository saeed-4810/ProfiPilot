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
import { z } from "zod";
import { MotionWrapper } from "@/components/MotionWrapper";
import { useAuth, getAuthErrorMessage } from "@/lib/auth";
import { trackPageView, trackLoginAttempt } from "@/lib/analytics";

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
  const { signIn, user, loading: authLoading } = useAuth();

  /* --- State --- */
  const [pageState, setPageState] = useState<PageState>("empty");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  /* --- Refs --- */
  const emailInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  /* --- Auto-focus email on mount --- */
  useEffect(() => {
    emailInputRef.current?.focus();
    trackPageView({ route: "/login", timestamp: Date.now() });
  }, []);

  /* --- Redirect if already authenticated --- */
  useEffect(() => {
    if (!authLoading && user !== null) {
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

      try {
        /* P-PERF-98-001: Sign in with valid credentials */
        await signIn(parsed.data.email, parsed.data.password);

        /* Success — redirect to dashboard */
        setPageState("success");
        router.push("/dashboard");
      } catch (err: unknown) {
        /* P-PERF-98-002: Invalid credentials → error shown */
        /* U-PERF-98-002: Error banner with role="alert" */
        const message = getAuthErrorMessage(err);
        setError(message);
        setPageState("error");
        setTimeout(() => errorRef.current?.focus(), 50);
      }
    },
    [signIn, router]
  );

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
            </form>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}
