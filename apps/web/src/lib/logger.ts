import { createBrowserLogger } from "@cs/logger/browser";
import type { WebEnv } from "../config/env";

export function makeLogger(env: WebEnv) {
  return createBrowserLogger({
    name: "web",
    level: env.appEnv === "production" ? "warn" : env.appEnv === "test" ? "silent" : "debug",
    includeStack: env.appEnv !== "production",
  });
}

export type WebLogger = ReturnType<typeof makeLogger>;
