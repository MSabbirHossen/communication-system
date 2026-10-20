// Node logger built on pino with privacy-safe defaults. Used by the application
// API. Browser code imports "@cs/logger/browser" instead.
import { pino, type DestinationStream, type Logger as PinoLogger, type LoggerOptions } from "pino";
import { REDACTED, scrub } from "./redact.js";

export { REDACTED, scrub } from "./redact.js";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
export type LoggerEnvironment = "development" | "test" | "production";

export interface CreateLoggerOptions {
  /** Service name, e.g. "api". Appears on every line as `service`. */
  name: string;
  level?: LogLevel;
  environment: LoggerEnvironment;
  /** Stack traces are only emitted outside production. Override for tests. */
  includeStack?: boolean;
  /** Where lines go (defaults to stdout). Tests pass a capture stream. */
  destination?: DestinationStream;
}

export type Logger = PinoLogger;

/** Paths pino redacts before serialization, on top of `scrub`. */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "*.password",
  "*.access_token",
  "*.refresh_token",
  "*.recovery_key",
];

export function createLogger(options: CreateLoggerOptions): Logger {
  const includeStack = options.includeStack ?? options.environment !== "production";
  const level = options.level ?? (options.environment === "test" ? "silent" : "info");
  const pinoOptions: LoggerOptions = {
    name: options.name,
    level,
    base: { service: options.name, env: options.environment },
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    formatters: {
      level: (label) => ({ level: label }),
      // Every merging object passes through the scrubber before serialization.
      log: (obj) => scrub(obj, { includeStack }) as Record<string, unknown>,
    },
    serializers: {
      err: (err: unknown) => scrub(err, { includeStack }),
      error: (err: unknown) => scrub(err, { includeStack }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return options.destination ? pino(pinoOptions, options.destination) : pino(pinoOptions);
}
