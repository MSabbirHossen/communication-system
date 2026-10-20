// Browser logger: console sink, same scrubbing rules, no network transport.
// There is deliberately no analytics or remote logging here (TRD §9.2).
import { scrub } from "./redact.js";

export { REDACTED, scrub } from "./redact.js";

export type BrowserLogLevel = "error" | "warn" | "info" | "debug" | "silent";
const ORDER: Record<BrowserLogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

export interface BrowserLogger {
  error(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
  child(scope: string): BrowserLogger;
}

export interface CreateBrowserLoggerOptions {
  name: string;
  level?: BrowserLogLevel;
  /** Stack traces for Error data are included outside production. */
  includeStack?: boolean;
  /** Sink override for tests; defaults to the global console. */
  sink?: Pick<Console, "error" | "warn" | "info" | "debug">;
}

export function createBrowserLogger(options: CreateBrowserLoggerOptions): BrowserLogger {
  const level = options.level ?? "info";
  const includeStack = options.includeStack ?? false;
  const sink = options.sink ?? console;
  const make = (scope: string): BrowserLogger => {
    const emit = (lvl: Exclude<BrowserLogLevel, "silent">, message: string, data?: unknown) => {
      if (ORDER[lvl] > ORDER[level]) return;
      const safe = data === undefined ? undefined : scrub(data, { includeStack });
      if (safe === undefined) sink[lvl](`[${scope}] ${message}`);
      else sink[lvl](`[${scope}] ${message}`, safe);
    };
    return {
      error: (m, d) => emit("error", m, d),
      warn: (m, d) => emit("warn", m, d),
      info: (m, d) => emit("info", m, d),
      debug: (m, d) => emit("debug", m, d),
      child: (s) => make(`${scope}:${s}`),
    };
  };
  return make(options.name);
}
