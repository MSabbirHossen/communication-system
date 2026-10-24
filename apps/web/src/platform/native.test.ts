import { describe, expect, it, vi } from "vitest";
import { installNativeLifecycle, isNativePlatform, type LifecycleHost } from "./native";

type Listener = (ev: never) => void;

function fakeApp() {
  const listeners = new Map<string, Listener[]>();
  const removed: string[] = [];
  const app = {
    addListener: vi.fn(async (name: string, fn: Listener) => {
      listeners.set(name, [...(listeners.get(name) ?? []), fn]);
      return { remove: async () => removed.push(name) };
    }),
    minimizeApp: vi.fn(async () => {}),
  };
  const fire = (name: string, ev: unknown) =>
    (listeners.get(name) ?? []).forEach((l) => l(ev as never));
  return { app, fire, removed };
}

describe("native lifecycle", () => {
  it("is not native under jsdom", () => {
    expect(isNativePlatform()).toBe(false);
  });

  it("nudges sync on resume, goes back while there is history, minimises at the root", async () => {
    const { app, fire, removed } = fakeApp();
    const onResume = vi.fn();
    const goBack = vi.fn();
    const remove = await installNativeLifecycle(
      { onResume },
      { app: app as unknown as LifecycleHost["app"], goBack },
    );
    fire("appStateChange", { isActive: false });
    expect(onResume).not.toHaveBeenCalled();
    fire("appStateChange", { isActive: true });
    expect(onResume).toHaveBeenCalledTimes(1);
    fire("backButton", { canGoBack: true });
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(app.minimizeApp).not.toHaveBeenCalled();
    fire("backButton", { canGoBack: false });
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
    await remove();
    expect(removed.sort()).toEqual(["appStateChange", "backButton"]);
  });
});
