import "dotenv/config";
import express, { type Express } from "express";
import { healthHandler } from "./routes/health.js";

export const app: Express = express();

const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/health", healthHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[backend] listening on port ${PORT}`);
  });
}

export default app;
