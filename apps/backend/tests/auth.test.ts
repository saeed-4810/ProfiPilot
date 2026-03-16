import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";
process.env["FIREBASE_PROJECT_ID"] = "test-project";

// --- Firebase Admin mock ---
// Mirrors the pattern from firebase.test.ts but adds auth() methods
const mockVerifyIdToken = vi.fn();
const mockCreateSessionCookie = vi.fn();
const mockVerifySessionCookie = vi.fn();
const mockRevokeRefreshTokens = vi.fn();

vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(() => ({
      name: "mock-app",
      auth: () => ({
        verifyIdToken: mockVerifyIdToken,
        createSessionCookie: mockCreateSessionCookie,
        verifySessionCookie: mockVerifySessionCookie,
        revokeRefreshTokens: mockRevokeRefreshTokens,
      }),
    })),
    credential: {
      cert: vi.fn(() => "mock-cert"),
      applicationDefault: vi.fn(() => "mock-adc"),
    },
  },
}));

const { app } = await import("../src/index.js");

beforeEach(() => {
  vi.clearAllMocks();
});

// T-AUTH-001: Verify valid Firebase token → 200 + session cookie set
describe("T-AUTH-001: POST /auth/verify-token (valid token)", () => {
  it("returns 200 and sets session cookie for a valid ID token", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockVerifyIdToken.mockResolvedValue({ uid: "user-123", iat: now });
    mockCreateSessionCookie.mockResolvedValue("mock-session-cookie-value");

    const res = await request(app)
      .post("/auth/verify-token")
      .send({ idToken: "valid-firebase-id-token" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "authenticated", uid: "user-123" });

    // Verify session cookie is set
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : String(cookies);
    expect(cookieStr).toContain("__session=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("SameSite=Strict");

    // Verify Firebase SDK was called correctly
    expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-firebase-id-token");
    expect(mockCreateSessionCookie).toHaveBeenCalledWith("valid-firebase-id-token", {
      expiresIn: 5 * 24 * 60 * 60 * 1000,
    });
  });
});

// T-AUTH-002: Verify invalid/expired token → 401 + ErrorEnvelope
describe("T-AUTH-002: POST /auth/verify-token (invalid token)", () => {
  it("returns 401 with ErrorEnvelope when token verification fails", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

    const res = await request(app)
      .post("/auth/verify-token")
      .send({ idToken: "expired-token" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_TOKEN_INVALID",
      message: "Firebase ID token is invalid or expired.",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("returns 400 with ErrorEnvelope when idToken is missing", async () => {
    const res = await request(app)
      .post("/auth/verify-token")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request body.",
    });
    expect(res.body.details).toBeDefined();
  });

  it("returns 401 when token is too old (stale)", async () => {
    // Token issued 10 minutes ago — beyond the 5-minute window
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    mockVerifyIdToken.mockResolvedValue({ uid: "user-123", iat: tenMinutesAgo });

    const res = await request(app)
      .post("/auth/verify-token")
      .send({ idToken: "stale-token" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_TOKEN_STALE",
    });
  });
});

// T-AUTH-003: Access protected route with valid session → 200
describe("T-AUTH-003: GET /auth/session (valid session)", () => {
  it("returns 200 with uid when session cookie is valid", async () => {
    mockVerifySessionCookie.mockResolvedValue({ uid: "user-456" });

    const res = await request(app)
      .get("/auth/session")
      .set("Cookie", "__session=valid-session-cookie");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "valid", uid: "user-456" });
    expect(mockVerifySessionCookie).toHaveBeenCalledWith("valid-session-cookie", true);
  });
});

// T-AUTH-004: Access protected route without session → 401
describe("T-AUTH-004: GET /auth/session (no session)", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await request(app).get("/auth/session");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_NO_SESSION",
      message: "Authentication required. No session cookie found.",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("returns 401 when session cookie is invalid", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("Session expired"));

    const res = await request(app)
      .get("/auth/session")
      .set("Cookie", "__session=invalid-cookie");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
  });
});

// T-AUTH-005: Logout → session cookie cleared + 200
describe("T-AUTH-005: POST /auth/logout", () => {
  it("returns 200 and clears session cookie when logged in", async () => {
    mockVerifySessionCookie.mockResolvedValue({ uid: "user-789" });
    mockRevokeRefreshTokens.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/auth/logout")
      .set("Cookie", "__session=valid-session-cookie");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "logged_out" });

    // Verify cookie is cleared
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : String(cookies);
    expect(cookieStr).toContain("__session=;");

    // Verify refresh tokens were revoked
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith("user-789");
  });

  it("returns 200 even when no session cookie is present", async () => {
    const res = await request(app).post("/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "logged_out" });
  });

  it("returns 200 even when session cookie is expired/invalid", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("Session expired"));

    const res = await request(app)
      .post("/auth/logout")
      .set("Cookie", "__session=expired-cookie");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "logged_out" });
  });
});
