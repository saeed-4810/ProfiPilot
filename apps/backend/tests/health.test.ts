import { describe, it, expect } from "vitest";
import request from "supertest";

process.env["NODE_ENV"] = "test";

// Lazy import after env is set to prevent server from binding a port
const { app } = await import("../src/index.js");

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns JSON content-type", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
