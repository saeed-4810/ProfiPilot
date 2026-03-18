import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks — firebase/app and firebase/auth                              */
/* ------------------------------------------------------------------ */

const mockInitializeApp = vi.fn().mockReturnValue({ name: "[DEFAULT]" });
const mockGetApp = vi.fn().mockReturnValue({ name: "[DEFAULT]" });
const mockGetApps = vi.fn().mockReturnValue([]);
const mockGetAuth = vi.fn().mockReturnValue({ currentUser: null });

vi.mock("firebase/app", () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApp: (...args: unknown[]) => mockGetApp(...args),
  getApps: () => mockGetApps(),
}));

vi.mock("firebase/auth", () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

/* Import after mocks */
import { getFirebaseApp, getFirebaseAuth } from "../../lib/firebase-client";

/* ------------------------------------------------------------------ */
/* T-SHELL-001: Firebase client SDK initializes with env vars          */
/* ------------------------------------------------------------------ */

describe("T-SHELL-001: Firebase client SDK initializes with env vars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes a new Firebase app when no apps exist", () => {
    mockGetApps.mockReturnValue([]);

    const app = getFirebaseApp();

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).toHaveBeenCalledWith({
      apiKey: expect.any(String),
      authDomain: expect.any(String),
      projectId: expect.any(String),
      storageBucket: expect.any(String),
      messagingSenderId: expect.any(String),
      appId: expect.any(String),
    });
    expect(app).toEqual({ name: "[DEFAULT]" });
  });

  it("returns existing app when already initialized", () => {
    mockGetApps.mockReturnValue([{ name: "[DEFAULT]" }]);

    const app = getFirebaseApp();

    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockGetApp).toHaveBeenCalledTimes(1);
    expect(app).toEqual({ name: "[DEFAULT]" });
  });

  it("getFirebaseAuth returns Auth instance from the app", () => {
    mockGetApps.mockReturnValue([]);
    const mockAuthInstance = { currentUser: null, name: "auth" };
    mockGetAuth.mockReturnValue(mockAuthInstance);

    const auth = getFirebaseAuth();

    expect(mockGetAuth).toHaveBeenCalledTimes(1);
    expect(auth).toBe(mockAuthInstance);
  });

  it("getFirebaseAuth reuses existing app if already initialized", () => {
    mockGetApps.mockReturnValue([{ name: "[DEFAULT]" }]);
    const mockAuthInstance = { currentUser: null };
    mockGetAuth.mockReturnValue(mockAuthInstance);

    const auth = getFirebaseAuth();

    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockGetApp).toHaveBeenCalled();
    expect(auth).toBe(mockAuthInstance);
  });
});
