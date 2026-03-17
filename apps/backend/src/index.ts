import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { healthHandler } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { auditRouter } from "./routes/audit.js";
import { errorHandler } from "./middleware/error.js";

export const app: Express = express();

const PORT = process.env.PORT ?? 3001;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", healthHandler);
app.use("/auth", authRouter);
app.use("/audits", auditRouter);

// Global error handler — must be registered after all routes (ADR-003)
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT);
}

export default app;
