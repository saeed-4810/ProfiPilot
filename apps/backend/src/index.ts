import "dotenv/config";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { healthHandler } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler } from "./middleware/error.js";

export const app: Express = express();

const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use(cookieParser());

app.get("/health", healthHandler);
app.use("/auth", authRouter);

// Global error handler — must be registered after all routes (ADR-003)
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT);
}

export default app;
