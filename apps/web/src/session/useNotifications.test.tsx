import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { MatrixClient } from "../matrix/client";
import { mockViewport } from "../test/setup";
import { controllerIn, fakeClient, renderApp } from "../test/session";

const BOB = "@bob:localhost";
const ROOM = "!r:localhost";

function roomClient() {
  const base = fakeClient() as unknown as Record<string, unknown>;
  const room = {
    roomId: ROOM,
    getMyMembership: () => "join",
    getDMInviter: () => BOB,
    getMember: (id: string) => (id === BOB ? { name: "Bob", userId: BOB } : null),
    getMembers: () => [],
  };
  const client = {
    ...base,
    getRoom: (id: string) => (id === ROOM ? room : null),
    getAccountData: () => undefined,
  } as unknown as MatrixClient;
  const emit = base.emit as (e: string, ...a: unknown[]) => void;
  const incoming = (id: string, body: string) =>
    emit(
      "Room.timeline",
      {
        getId: () => id,
        getSender: () => BOB,
        getType: () => "m.room.message",
        getContent: () => ({ msgtype: "m.text", body }),
        getRoomId: () => ROOM,
        isBeingDecrypted: () => false,
        isDecryptionFailure: () => false,
      },
      room,
      false,
      false,
      { liveEvent: true },
    );
  return { client, incoming };
}

function hideDocument(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

describe("browser notifications in the shell", () => {
  it("shows a generic notification for a new message while the tab is hidden, without the body", async () => {
    mockViewport(true);
    const created: Array<{ title: string; options: { tag?: string } | undefined }> = [];
    class FakeNotification {
      static permission = "granted";
      static requestPermission = vi.fn(async () => "granted" as const);
      onclick: unknown = null;
      constructor(title: string, options?: { tag?: string }) {
        created.push({ title, options });
      }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    hideDocument(true);
    try {
      const fake = roomClient();
      const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
      renderApp("/chats", c);
      await screen.findByText("No conversations yet");
      fake.incoming("$1", "the secret body");
      expect(created).toEqual([{ title: "New message", options: { tag: ROOM } }]);
      expect(JSON.stringify(created)).not.toContain("secret");
      hideDocument(false);
      fake.incoming("$2", "another");
      expect(created).toHaveLength(1);
    } finally {
      hideDocument(false);
      vi.unstubAllGlobals();
    }
  });

  it("does nothing without the browser permission", async () => {
    mockViewport(true);
    const ctor = vi.fn();
    class FakeNotification {
      static permission = "default";
      static requestPermission = vi.fn(async () => "default" as const);
      constructor(title: string) {
        ctor(title);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    hideDocument(true);
    try {
      const fake = roomClient();
      const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
      renderApp("/chats", c);
      await screen.findByText("No conversations yet");
      fake.incoming("$1", "hidden");
      expect(ctor).not.toHaveBeenCalled();
    } finally {
      hideDocument(false);
      vi.unstubAllGlobals();
    }
  });
});
