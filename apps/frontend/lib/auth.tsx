"use client";

/**
 * Auth Context Provider — tracks Firebase Auth state and provides
 * signIn / signUp / signOut / sendVerificationEmail / getIdToken methods.
 *
 * Per ADR-010 + ADR-028 session lifecycle:
 *   1. signUp: Firebase createUserWithEmailAndPassword → sendEmailVerification → redirect /verify-email
 *      (does NOT call POST /auth/verify-token — email must be verified first)
 *   2. signIn: Firebase signInWithEmailAndPassword → POST /auth/verify-token
 *      (server checks email_verified === true; returns 403 AUTH_EMAIL_NOT_VERIFIED if false)
 *   3. signOut: POST /auth/logout (clears cookie) → Firebase signOut
 *   4. onAuthStateChanged: keeps user/loading/error in sync
 *
 * T-SHELL-002: AuthProvider tracks auth state changes via onAuthStateChanged.
 * T-SHELL-005: Sign-out clears session and redirects.
 * T-PERF-138-002: signUp calls sendEmailVerification after account creation.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AuthState {
  /** Current Firebase user, or null if unauthenticated. */
  user: User | null;
  /** True while the initial auth state is resolving. */
  loading: boolean;
  /** Human-readable error message, or null. */
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  /** Sign in with email + password. Sets server-side session cookie. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign up with email + password. Sends verification email (no session cookie). */
  signUp: (email: string, password: string) => Promise<void>;
  /** Resend verification email to the current Firebase user. */
  sendVerificationEmail: () => Promise<void>;
  /** Sign out. Clears server-side session cookie and Firebase session. */
  signOut: () => Promise<void>;
  /** Get the current user's ID token (for manual API calls). */
  getIdToken: () => Promise<string | null>;
}

/* ------------------------------------------------------------------ */
/* API base URL                                                        */
/* ------------------------------------------------------------------ */

const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthContextValue | null>(null);

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Access the auth context. Must be used within an `<AuthProvider>`.
 * Throws if used outside the provider tree.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  /* --- Listen to Firebase auth state changes --- */
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setState({ user, loading: false, error: null });
      },
      (err) => {
        setState({ user: null, loading: false, error: err.message });
      }
    );
    return unsubscribe;
  }, []);

  /* --- signIn: Firebase auth → server session cookie --- */
  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      // POST /auth/verify-token to set __session cookie (per ADR-010)
      const response = await fetch(`${API_BASE}/auth/verify-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        // T-PERF-138-001: Parse server error for AUTH_EMAIL_NOT_VERIFIED (ADR-028)
        const body = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string;
        } | null;
        if (body?.code === "AUTH_EMAIL_NOT_VERIFIED") {
          throw Object.assign(
            new Error(body.message ?? "Please verify your email address before signing in."),
            { code: "auth/email-not-verified" }
          );
        }
        throw new Error("Failed to verify session with server.");
      }

      // onAuthStateChanged will update state with the user
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  /* --- signUp: Firebase create account → send verification email (ADR-028) --- */
  const signUp = useCallback(async (email: string, password: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const auth = getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      // T-PERF-138-002: Send verification email instead of establishing session
      await sendEmailVerification(credential.user);

      // Sign out the Firebase client — user must verify email before signing in
      await firebaseSignOut(auth);

      // onAuthStateChanged will update state to user: null
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign-up failed.";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  /* --- sendVerificationEmail: resend verification email to current user --- */
  const sendVerificationEmail = useCallback(async (): Promise<void> => {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (currentUser === null) {
      throw new Error("No user is currently signed in.");
    }
    await sendEmailVerification(currentUser);
  }, []);

  /* --- signOut: server logout → Firebase signOut --- */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      // POST /auth/logout to clear __session cookie (per ADR-010)
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort server logout — continue with client-side cleanup
    }

    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    // onAuthStateChanged will update state to user: null
  }, []);

  /* --- getIdToken: returns current user's ID token --- */
  const getIdToken = useCallback(async (): Promise<string | null> => {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (currentUser === null) {
      return null;
    }
    return currentUser.getIdToken();
  }, []);

  /* --- Memoize context value to prevent unnecessary re-renders --- */
  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      loading: state.loading,
      error: state.error,
      signIn,
      signUp,
      sendVerificationEmail,
      signOut,
      getIdToken,
    }),
    [
      state.user,
      state.loading,
      state.error,
      signIn,
      signUp,
      sendVerificationEmail,
      signOut,
      getIdToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Firebase error code → user-friendly message mapping                 */
/* ------------------------------------------------------------------ */

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-disabled": "This account has been disabled. Contact support.",
  "auth/user-not-found": "No account found with this email address.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Invalid email or password. Please try again.",
  "auth/too-many-requests": "Too many attempts. Please wait and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/email-not-verified": "Please verify your email address before signing in.",
};

const DEFAULT_AUTH_ERROR = "An unexpected error occurred. Please try again.";

/**
 * Convert a Firebase Auth error (or any error) into a user-safe message.
 * Firebase errors have a `code` property like "auth/invalid-credential".
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const firebaseError = error as Error & { code?: string };
    if (firebaseError.code !== undefined && firebaseError.code in FIREBASE_ERROR_MESSAGES) {
      return FIREBASE_ERROR_MESSAGES[firebaseError.code] as string;
    }
    // If the error message is already user-friendly (from our signIn), use it
    if (error.message !== "" && !error.message.startsWith("Firebase:")) {
      return error.message;
    }
  }
  return DEFAULT_AUTH_ERROR;
}
