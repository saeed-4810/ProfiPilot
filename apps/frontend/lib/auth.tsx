"use client";

/**
 * Auth Context Provider — tracks Firebase Auth state and provides
 * signIn / signOut / getIdToken methods to the component tree.
 *
 * Per ADR-010 session lifecycle:
 *   1. signIn: Firebase signInWithEmailAndPassword → POST /auth/verify-token (sets __session cookie)
 *   2. signOut: POST /auth/logout (clears cookie) → Firebase signOut
 *   3. onAuthStateChanged: keeps user/loading/error in sync
 *
 * T-SHELL-002: AuthProvider tracks auth state changes via onAuthStateChanged.
 * T-SHELL-005: Sign-out clears session and redirects.
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
        throw new Error("Failed to verify session with server.");
      }

      // onAuthStateChanged will update state with the user
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
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
      signOut,
      getIdToken,
    }),
    [state.user, state.loading, state.error, signIn, signOut, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
