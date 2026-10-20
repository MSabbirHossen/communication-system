import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";

const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;
const KEY = "requestId";

/** Assign a request id (honouring a well-formed incoming `x-request-id`) and echo it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.locals[KEY] = id;
  res.setHeader("x-request-id", id);
  next();
};

/** The id assigned by `requestId`, or "unknown" before the middleware ran. */
export function getRequestId(res: Response): string {
  const v: unknown = res.locals[KEY];
  return typeof v === "string" ? v : "unknown";
}
