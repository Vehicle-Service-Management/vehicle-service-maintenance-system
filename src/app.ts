import express, { type RequestHandler } from "express";
import helmet from "helmet";
import type { AppDatabase } from "./db";
import { createApiRouter } from "./routes";

export function createApp(
  db: AppDatabase,
  jwtSecret: string
): express.Express {
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", createApiRouter(db, jwtSecret));

  const notFound: RequestHandler = (_req, res) => {
    res.status(404).json({ error: "Not found" });
  };
  app.use(notFound);
  app.use((
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Malformed JSON request body" });
      return;
    }
    console.error("Unhandled request error", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
