import admin from "firebase-admin";

let app: admin.app.App | undefined;

export function initFirebase(): admin.app.App {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID env var is required to initialize Firebase Admin SDK.");
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  } else {
    // Falls back to Application Default Credentials (ADC) in CI/staging/prod
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  return app;
}

export function getFirebaseApp(): admin.app.App {
  if (!app) return initFirebase();
  return app;
}
