/**
 * Cloud Functions entry point — PrefPilot (PERF-141 / PERF-162).
 *
 * All Cloud Function exports must be re-exported from this file.
 * Firebase CLI discovers functions by reading `main` in package.json
 * which points to `lib/index.js` (compiled from this file).
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK once at module level.
// In Cloud Functions runtime, credentials are provided automatically.
admin.initializeApp();

export { onFeedbackCreate } from "./onFeedbackCreate";
