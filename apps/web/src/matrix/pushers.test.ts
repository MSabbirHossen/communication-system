import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { isGatewayUrl, removePusher, setContentFreePusher } from "./pushers";

const target = {
  appId: "org.communicationsystem.app.android",
  pushkey: "fcm-token-123",
  gatewayUrl: "https://push.example.org/_matrix/push/v1/notify",
  appDisplayName: "Communication System",
  deviceDisplayName: "Pixel",
};

describe("content-free pushers", () => {
  it("registers an http pusher with the event_id_only format and nothing else about content", async () => {
    const setPusher = vi.fn(async () => ({}));
    await setContentFreePusher({ setPusher } as unknown as MatrixClient, target);
    expect(setPusher).toHaveBeenCalledWith({
      kind: "http",
      app_id: target.appId,
      pushkey: target.pushkey,
      app_display_name: "Communication System",
      device_display_name: "Pixel",
      lang: "en",
      data: { url: target.gatewayUrl, format: "event_id_only" },
      append: false,
    });
  });

  it("refuses a gateway URL that is not the notify endpoint", async () => {
    const setPusher = vi.fn(async () => ({}));
    await expect(
      setContentFreePusher({ setPusher } as unknown as MatrixClient, {
        ...target,
        gatewayUrl: "https://push.example.org/anything",
      }),
    ).rejects.toThrow(/notify/);
    expect(setPusher).not.toHaveBeenCalled();
    expect(isGatewayUrl("not a url")).toBe(false);
  });

  it("removes a pusher with kind null", async () => {
    const setPusher = vi.fn(async () => ({}));
    await removePusher({ setPusher } as unknown as MatrixClient, target.appId, target.pushkey);
    expect(setPusher).toHaveBeenCalledWith(
      expect.objectContaining({ kind: null, app_id: target.appId, pushkey: target.pushkey }),
    );
  });
});
