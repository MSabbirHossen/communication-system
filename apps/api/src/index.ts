// Bootstrap: validate configuration → connect MongoDB → listen.
// Any failure here exits non-zero with a message that names variables, never values.
import { createRequire } from "node:module";
import { createLogger } from "@cs/logger";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createMongo } from "./db/mongo.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ name: "api", environment: env.NODE_ENV, level: env.LOG_LEVEL });
  const mongo = createMongo(env.MONGODB_URI, env.MONGODB_DB_NAME);

  await mongo.connect();
  logger.info({ db: env.MONGODB_DB_NAME }, "mongodb connected");

  const app = createApp({ env, logger, version, checks: { mongo: () => mongo.ping() } });
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "api listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void mongo.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  // Configuration errors are safe to print: they contain variable names only.
  console.error(`api failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
