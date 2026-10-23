import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SetupPrompts } from "../matrix/cryptoSetup";
import { controllerIn, renderApp } from "../test/session";

function needsSetup(script: (p: SetupPrompts) => Promise<unknown>) {
  return controllerIn("ready", {
    getCryptoReadiness: vi.fn(async () => ({
      crossSigningReady: false,
      secretStorageReady: false,
      keyBackupEnabled: false,
      accountHasCrossSigning: false,
    })),
    ensureCryptoReady: vi.fn(async (_c, _h, prompts: SetupPrompts) => {
      await script(prompts);
      return { outcome: "created" as const, keyBackupEnabled: true };
    }),
  });
}

describe("secure device setup screen", () => {
  it("a signed-in device that needs setup is routed to /setup from anywhere", async () => {
    const c = await needsSetup(async () => new Promise(() => {})); // never completes
    renderApp("/chats", c);
    expect(await screen.findByRole("heading", { name: "Secure this device" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it("asks for the password when the server challenges, then shows the recovery key once", async () => {
    const c = await needsSetup(async (p) => {
      p.onStep?.("cross_signing");
      const pw = await p.requestPassword();
      expect(pw).toBe("correct horse battery");
      p.onStep?.("secret_storage");
      await p.showRecoveryKey("EsTc AbCd EfGh IjKl MnOp");
      p.onStep?.("key_backup");
    });
    renderApp("/setup", c);
    const user = userEvent.setup();
    const pw = await screen.findByLabelText("Password");
    await user.type(pw, "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("EsTc AbCd EfGh IjKl MnOp")).toBeInTheDocument();
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "I have saved my recovery key" }));
    expect(cont).toBeEnabled();
    await user.click(cont);

    expect(await screen.findByRole("status")).toHaveTextContent("This device is set up");
    expect(screen.queryByText("EsTc AbCd EfGh IjKl MnOp")).toBeNull(); // shown once only
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument(),
    );
  });

  it("offers recovery-key entry with a skip path on an additional device", async () => {
    const c = await controllerIn("ready", {
      getCryptoReadiness: vi.fn(async () => ({
        crossSigningReady: false,
        secretStorageReady: false,
        keyBackupEnabled: true,
        accountHasCrossSigning: true,
      })),
      ensureCryptoReady: vi.fn(async (_c, _h, prompts: SetupPrompts) => {
        const key = await prompts.requestRecoveryKey(1);
        return key === null
          ? { outcome: "skipped_needs_verification" as const }
          : { outcome: "restored" as const, keyBackupEnabled: true, keysRestored: 0 };
      }),
    });
    renderApp("/setup", c);
    const user = userEvent.setup();
    expect(await screen.findByLabelText("Recovery key")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "I don't have it — verify from another device" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("not yet verified");
  });

  it("shows a retry path when setup is cancelled", async () => {
    const c = await needsSetup(async (p) => {
      await p.requestPassword();
    });
    renderApp("/setup", c);
    const user = userEvent.setup();
    await screen.findByLabelText("Password");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Setup was cancelled");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
