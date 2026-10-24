// Push registration (PRD FR-09, THREAT_MODEL TM-12, ADR-0006): the homeserver sends the
// gateway only event and room identifiers (`event_id_only`), never content, a sender name
// or a room name; the app fetches and decrypts after wake and shows generic text. The
// pushkey (a device token) comes from a native token provider that does not exist yet, so
// the app registers nothing until push delivery is configured.
import type { MatrixClient } from "matrix-js-sdk";

export interface PusherTarget {
  /** Reverse-DNS application id known to the gateway (per platform). */
  appId: string;
  /** The device push token; opaque to this client. */
  pushkey: string;
  /** The gateway's notify endpoint; must end with /_matrix/push/v1/notify. */
  gatewayUrl: string;
  appDisplayName: string;
  deviceDisplayName: string;
}

export const NOTIFY_PATH = "/_matrix/push/v1/notify";

export function isGatewayUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith(NOTIFY_PATH);
  } catch {
    return false;
  }
}

/** Register (or replace) this device's content-free HTTP pusher. */
export async function setContentFreePusher(client: MatrixClient, t: PusherTarget): Promise<void> {
  if (!isGatewayUrl(t.gatewayUrl)) throw new Error("push gateway URL must end with " + NOTIFY_PATH);
  await client.setPusher({
    kind: "http",
    app_id: t.appId,
    pushkey: t.pushkey,
    app_display_name: t.appDisplayName,
    device_display_name: t.deviceDisplayName,
    lang: "en",
    data: { url: t.gatewayUrl, format: "event_id_only" },
    append: false,
  });
}

/** Remove this device's pusher (kind null deletes it, per the client-server API). */
export async function removePusher(
  client: MatrixClient,
  appId: string,
  pushkey: string,
): Promise<void> {
  await client.setPusher({
    kind: null as unknown as string,
    app_id: appId,
    pushkey,
    app_display_name: "",
    device_display_name: "",
    lang: "en",
    data: {},
  });
}
