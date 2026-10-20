import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Logger } from "@cs/logger";
import type { ApiEnv } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestLogging } from "./middleware/logging.js";
import { requestId } from "./middleware/requestId.js";
import { healthRouter, type ReadinessChecks } from "./routes/health.js";

export interface AppDependencies {
  env: ApiEnv;
  logger: Logger;
  version: string;
  checks: ReadinessChecks;
  /** Optional hook to mount additional routers before the 404/error handlers (used by tests and later phases). */
  mount?: (app: Express) => void;
}

/** Build the Express app without listening, so tests can drive it with supertest. */
export function createApp({ env, logger, version, checks, mount }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: false,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use(requestId);
  app.use(requestLogging(logger));
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/api/v1",
    rateLimit({
      // Foundation limit only; abuse-prone endpoints get their own stricter limits in Phase 6.
      windowMs: 60_000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "rate_limited", message: "too many requests" } },
    }),
  );

  app.use("/api/v1", healthRouter(env, version, checks));
  mount?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
