/**
 * Firebase Client SDK initialization singleton.
 *
 * Initializes the Firebase app with public config from NEXT_PUBLIC_* env vars.
 * Exports a `getFirebaseAuth()` function that returns the Auth instance.
 *
 * Per ADR-004: Client receives Firebase ID token; server verifies via Admin SDK.
 * Per ADR-010: Client authenticates via Firebase Auth SDK, server verifies the token.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/** Firebase config sourced from public env vars (safe to expose in browser bundle). */
const firebaseConfig = {
  apiKey: process.env["NEXT_PUBLIC_FIREBASE_API_KEY"] ?? "",
  authDomain: process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] ?? "",
  projectId: process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] ?? "",
  storageBucket: process.env["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"] ?? "",
  messagingSenderId: process.env["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"] ?? "",
  appId: process.env["NEXT_PUBLIC_FIREBASE_APP_ID"] ?? "",
};

/**
 * Get or initialize the Firebase app singleton.
 * Uses `getApps()` to avoid duplicate initialization in hot-reload / SSR.
 */
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

/**
 * Get the Firebase Auth instance (singleton).
 * T-SHELL-001: Returns Auth instance initialized with env vars.
 */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
