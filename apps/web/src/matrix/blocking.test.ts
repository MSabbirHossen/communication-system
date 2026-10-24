import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { MatrixClient } from "matrix-js-sdk";
import { blockUser, isBlocked, listBlocked, unblockUser, watchBlocked } from "./blocking";

function fakeClient(initial: string[] = []) {
  const em = new EventEmitter();
  const state = {
    ignored: Object.fromEntries(initial.map((u) => [u, {}])) as Record<string, unknown>,
  };
  const setIgnoredUsers = vi.fn(async (ids: string[]) => {
    state.ignored = Object.fromEntries(ids.map((u) => [u, {}]));
    em.emit("accountData", {
      getType: () => "m.ignored_user_list",
      getContent: () => ({ ignored_users: state.ignored }),
    });
    return {};
  });
  const client = {
    getAccountData: (type: string) =>
      type === "m.ignored_user_list"
        ? { getContent: () => ({ ignored_users: state.ignored }) }
        : undefined,
    setIgnoredUsers,
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
  } as unknown as MatrixClient;
  return { client, em, setIgnoredUsers };
}

describe("blocking via the ignore list", () => {
  it("lists ignored users from account data, sorted, and tolerates missing data", () => {
    expect(listBlocked(fakeClient(["@z:localhost", "@a:localhost"]).client)).toEqual([
      "@a:localhost",
      "@z:localhost",
    ]);
    const none = { getAccountData: () => undefined } as unknown as MatrixClient;
    expect(listBlocked(none)).toEqual([]);
    const junk = {
      getAccountData: () => ({ getContent: () => ({ ignored_users: "x" }) }),
    } as unknown as MatrixClient;
    expect(listBlocked(junk)).toEqual([]);
  });

  it("blocks and unblocks idempotently through setIgnoredUsers", async () => {
    const { client, setIgnoredUsers } = fakeClient(["@a:localhost"]);
    await blockUser(client, "@b:localhost");
    expect(setIgnoredUsers).toHaveBeenLastCalledWith(["@a:localhost", "@b:localhost"]);
    await blockUser(client, "@b:localhost");
    expect(setIgnoredUsers).toHaveBeenCalledTimes(1);
    expect(isBlocked(client, "@b:localhost")).toBe(true);
    await unblockUser(client, "@a:localhost");
    expect(setIgnoredUsers).toHaveBeenLastCalledWith(["@b:localhost"]);
    await unblockUser(client, "@nobody:localhost");
    expect(setIgnoredUsers).toHaveBeenCalledTimes(2);
  });

  it("watches changes to the ignore list only", () => {
    const { client, em } = fakeClient();
    const cb = vi.fn();
    const stop = watchBlocked(client, cb);
    em.emit("accountData", { getType: () => "m.direct", getContent: () => ({}) });
    expect(cb).not.toHaveBeenCalled();
    em.emit("accountData", { getType: () => "m.ignored_user_list", getContent: () => ({}) });
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
    expect(em.eventNames()).toEqual([]);
  });
});
