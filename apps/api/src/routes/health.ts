import { Router } from "express";
import type { HealthResponse, ReadyResponse } from "@cs/shared-types";
import type { ApiEnv } from "../config/env.js";

export interface ReadinessChecks {
  /** Resolves when MongoDB answers a ping. */
  mongo(): Promise<void>;
}

export function healthRouter(env: ApiEnv, version: string, checks: ReadinessChecks): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const body: HealthResponse = {
      status: "ok",
      service: "api",
      version,
      environment: env.NODE_ENV,
    };
    res.json(body);
  });

  router.get("/ready", async (_req, res) => {
    const results: ReadyResponse["checks"] = {};
    try {
      await checks.mongo();
      results.mongo = "ok";
    } catch {
      results.mongo = "failed";
    }
    const allOk = Object.values(results).every((v) => v === "ok");
    const body: ReadyResponse = { status: allOk ? "ready" : "unavailable", checks: results };
    res.status(allOk ? 200 : 503).json(body);
  });

  return router;
}
