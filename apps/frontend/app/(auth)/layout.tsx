"use client";

/**
 * Auth route group layout — wraps public auth pages (login) with AuthProvider.
 *
 * The login page needs AuthProvider to:
 * 1. Check if user is already authenticated (redirect to /dashboard)
 * 2. Call signIn() on form submission
 *
 * Unlike the (authenticated) layout, this does NOT include navigation
 * or auth guard — these are public pages.
 */

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
