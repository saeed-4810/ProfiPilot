import { describe, it, expect, afterEach, vi } from "vitest";

// Mock firebase-admin before importing the module under test
vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(() => ({ name: "mock-app" })),
    credential: {
      cert: vi.fn(() => "mock-cert"),
      applicationDefault: vi.fn(() => "mock-adc"),
    },
  },
}));

describe("Firebase Admin initialization", () => {
  afterEach(() => {
    // Reset module registry between tests so singleton state is cleared
    vi.resetModules();
    delete process.env["FIREBASE_PROJECT_ID"];
    delete process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  });

  it("throws when FIREBASE_PROJECT_ID is not set", async () => {
    delete process.env["FIREBASE_PROJECT_ID"];
    const { initFirebase } = await import("../src/lib/firebase.js");
    expect(() => initFirebase()).toThrowError("FIREBASE_PROJECT_ID env var is required");
  });

  it("initializes with service account JSON when FIREBASE_SERVICE_ACCOUNT_JSON is set", async () => {
    process.env["FIREBASE_PROJECT_ID"] = "test-project";
    process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] = JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key: "mock-key",
      client_email: "mock@test.iam.gserviceaccount.com",
    });
    const { initFirebase } = await import("../src/lib/firebase.js");
    const result = initFirebase();
    expect(result).toBeDefined();
  });

  it("initializes with ADC when FIREBASE_SERVICE_ACCOUNT_JSON is not set", async () => {
    process.env["FIREBASE_PROJECT_ID"] = "test-project";
    const { initFirebase } = await import("../src/lib/firebase.js");
    const result = initFirebase();
    expect(result).toBeDefined();
  });
});
