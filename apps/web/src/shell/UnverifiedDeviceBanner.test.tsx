import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockViewport } from "../test/setup";
import { controllerIn, renderApp, testSession } from "../test/session";

const unverifiedReadiness = () => ({
  crossSigningReady: false,
  secretStorageReady: false,
  keyBackupEnabled: false,
  accountHasCrossSigning: true,
});

describe("unverified-device notice (ADR-0003 D5, amended 2026-10-31)", () => {
  it("is absent on a device that is set up", async () => {
    mockViewport(true);
    renderApp("/chats", await controllerIn("ready"));
    expect(screen.queryByText(/isn't verified/)).toBeNull();
  });

  it("opens the app with the notice after a recorded skip, and offers both ways to trust", async () => {
    mockViewport(true);
    const c = await controllerIn("ready", {
      loadSession: vi.fn(async () => ({ ...testSession, setupDeferredAt: 1 })),
      getCryptoReadiness: vi.fn(async () => unverifiedReadiness()),
      // The reopened setup holds at the recovery-key prompt, as the real one does.
      ensureCryptoReady: vi.fn(async (_c, _h, prompts) => {
        const key = await prompts.requestRecoveryKey(1);
        return key === null
          ? { outcome: "skipped_needs_verification" as const }
          : { outcome: "restored" as const, keyBackupEnabled: true, keysRestored: 0 };
      }),
    });
    expect(c.getSnapshot()).toMatchObject({ status: "ready", deviceUnverified: true });
    renderApp("/chats", c);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("This device isn't verified");
    expect(screen.getByRole("link", { name: "Verify from another device" })).toHaveAttribute(
      "href",
      "/settings/devices",
    );
    // Chats is still usable behind the notice.
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Enter recovery key" }));
    expect(await screen.findByLabelText("Recovery key")).toBeInTheDocument();
    expect(c.getSnapshot().status).toBe("crypto_setup");
  });
});
