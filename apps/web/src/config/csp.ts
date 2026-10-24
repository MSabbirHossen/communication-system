// Content-Security-Policy `connect-src` for index.html, derived from the same configuration
// the client uses (ADR-0006): only the configured homeserver and application API origins may
// be contacted, plus the Vite dev websocket while serving. Production hardening of the rest
// of the policy (nonces, no unsafe-inline) remains a Phase 7 task (THREAT_MODEL TM-11).
import type { EnvSource } from "@cs/validation";
import { loadWebEnv } from "./env";

/** The space-separated origins allowed in `connect-src` (never a full URL with a path). */
export function connectSources(source: EnvSource, command: "serve" | "build"): string {
  const env = loadWebEnv(source);
  const origins = new Set<string>(["'self'"]);
  for (const url of [env.homeserverUrl, env.apiUrl]) origins.add(new URL(url).origin);
  if (command === "serve") origins.add("ws://localhost:5173");
  return [...origins].join(" ");
}

export const CONNECT_SRC_PLACEHOLDER = "__CS_CONNECT_SRC__";

/** Replace the placeholder in index.html; throws when it is missing so a stale template cannot ship. */
export function applyConnectSources(html: string, sources: string): string {
  if (!html.includes(CONNECT_SRC_PLACEHOLDER)) {
    throw new Error("index.html lacks the connect-src placeholder");
  }
  return html.split(CONNECT_SRC_PLACEHOLDER).join(sources);
}
