import { appEnvironment, httpUrl, parseEnv, z, type EnvSource } from "@cs/validation";

const schema = z.object({
  VITE_APP_ENV: appEnvironment.default("development"),
  VITE_HOMESERVER_URL: httpUrl.default("http://localhost:8008"),
  VITE_API_URL: httpUrl.default("http://localhost:3000"),
});

export type WebEnv = {
  appEnv: "development" | "test" | "production";
  homeserverUrl: string;
  apiUrl: string;
};

/** Validate the Vite-injected environment. Throws EnvValidationError (names only). */
export function loadWebEnv(source: EnvSource = import.meta.env as unknown as EnvSource): WebEnv {
  const e = parseEnv(schema, source);
  return { appEnv: e.VITE_APP_ENV, homeserverUrl: e.VITE_HOMESERVER_URL, apiUrl: e.VITE_API_URL };
}
