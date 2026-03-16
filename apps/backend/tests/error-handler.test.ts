import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../src/middleware/error.js";
import { AppError } from "../src/domain/errors.js";

// Standalone Express app for testing the error handler in isolation.
// This avoids Firebase mock complexity and tests the middleware directly.

function createTestApp() {
  const app = express();

  // Route that throws an AppError
  app.get("/throw-app-error", (_req, _res, next) => {
    next(new AppError(422, "TEST_APP_ERROR", "This is a test AppError."));
  });

  // Route that throws a raw Error (non-AppError)
  app.get("/throw-raw-error", (_req, _res, next) => {
    next(new Error("Something unexpected happened"));
  });

  // Route that throws a string (non-Error)
  app.get("/throw-string", (_req, _res, next) => {
    next("raw string error");
  });

  app.use(errorHandler);
  return app;
}

describe("Global error handler (errorHandler middleware)", () => {
  const app = createTestApp();

  it("returns structured ErrorEnvelope for AppError", async () => {
    const res = await request(app).get("/throw-app-error");

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      status: 422,
      code: "TEST_APP_ERROR",
      message: "This is a test AppError.",
    });
    expect(res.body.traceId).toBeDefined();
  });

  it("returns 500 INTERNAL_ERROR for raw Error (non-AppError)", async () => {
    const res = await request(app).get("/throw-raw-error");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });
    expect(res.body.traceId).toBeDefined();
    // Must NOT leak the original error message
    expect(res.body.message).not.toContain("Something unexpected");
  });

  it("returns 500 INTERNAL_ERROR for non-Error throws (string)", async () => {
    const res = await request(app).get("/throw-string");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
    });
  });
});
