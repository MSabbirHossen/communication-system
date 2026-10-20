import type { RequestHandler } from "express";
import type { Logger } from "@cs/logger";
import { getRequestId } from "./requestId.js";

/**
 * One structured line per request: id, method, matched route (never the raw
 * query string), status and duration. Bodies and headers are never logged.
 */
export function requestLogging(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level](
        {
          requestId: getRequestId(res),
          method: req.method,
          route,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        },
        "request",
      );
    });
    next();
  };
}
