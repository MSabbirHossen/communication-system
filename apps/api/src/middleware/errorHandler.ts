import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "@cs/logger";
import { ApiError, envelope } from "../errors.js";
import { getRequestId } from "./requestId.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(envelope("not_found", "route not found", getRequestId(res)));
};

type BodyParserError = Error & { type?: string; status?: number; expose?: boolean };

/**
 * Maps errors to the consistent envelope (TRD §8.2, §8.4). Stack traces and
 * internal messages never reach the client; they go to the logger, which
 * omits stacks in production.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, _next) => {
    const requestId = getRequestId(res);
    if (err instanceof ApiError) {
      logger.warn({ requestId, code: err.code, status: err.status }, "request failed");
      res.status(err.status).json(envelope(err.code, err.message, requestId, err.details));
      return;
    }
    const e = err as BodyParserError;
    if (e?.type === "entity.too.large") {
      res.status(413).json(envelope("payload_too_large", "request body too large", requestId));
      return;
    }
    if (e?.type === "entity.parse.failed") {
      res.status(400).json(envelope("invalid_json", "request body is not valid JSON", requestId));
      return;
    }
    if (typeof e?.status === "number" && e.status >= 400 && e.status < 500 && e.expose) {
      res
        .status(e.status)
        .json(envelope("bad_request", "request could not be processed", requestId));
      return;
    }
    logger.error({ requestId, err }, "unhandled error");
    res.status(500).json(envelope("internal", "internal server error", requestId));
  };
}
