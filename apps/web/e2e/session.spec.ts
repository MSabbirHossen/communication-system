import { expect, test } from "@playwright/test";
import { checkA11y, newUser, registerAndSetUp, signInAndRestore } from "./helpers";

test("a device signed out from another device lands on sign-in with an explanation", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const p1 = await first.newPage();
  const p2 = await second.newPage();
  const carol = newUser("e2e-carol");

  const { recoveryKey } = await registerAndSetUp(p1, carol);
  await signInAndRestore(p2, carol, recoveryKey);

  await p2.goto("/settings/devices");
  await expect(p2.getByRole("list", { name: "Your devices" })).toBeVisible({ timeout: 60_000 });
  await p2.getByRole("button", { name: "Sign out all other devices" }).click();
  await p2
    .getByRole("dialog", { name: "Sign out all other devices?" })
    .getByRole("button", { name: /Sign out/ })
    .click();
  await p2.getByLabel("Password", { exact: true }).fill(carol.password);
  await p2.getByRole("button", { name: "Confirm" }).click();
  await expect(p2.getByText(/other device\(s\) signed out/)).toBeVisible({ timeout: 60_000 });

  // The revoked device learns of it from the server and drops to sign-in, saying why.
  await expect(p1.getByText("Your session has expired. Sign in again.")).toBeVisible({
    timeout: 120_000,
  });
  await checkA11y(p1, "signed-out-expired");

  await first.close();
  await second.close();
});
