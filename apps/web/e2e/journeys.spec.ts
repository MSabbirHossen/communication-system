import { expect, test } from "@playwright/test";
import { checkA11y, messageBody, newUser, registerAndSetUp } from "./helpers";

const LONG = 60_000;

test("two people register, converse end to end, block and unblock, change settings, reload, keep one tab and sign out", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ permissions: ["notifications"] });
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const alice = newUser("e2e-alice");
  const bob = newUser("e2e-bob");

  await test.step("register and set up both devices", async () => {
    await registerAndSetUp(a, alice);
    await registerAndSetUp(b, bob);
    await checkA11y(a, "chats-empty");
  });

  await test.step("Alice starts an encrypted conversation by identifier", async () => {
    await a.getByRole("link", { name: "New conversation" }).click();
    await checkA11y(a, "new-conversation");
    await a.getByLabel("Username or Matrix ID").fill(bob.username);
    await a.getByRole("button", { name: "Look up" }).click();
    await a.getByRole("button", { name: "Start encrypted conversation" }).click();
    await expect(a.getByRole("heading", { name: bob.username })).toBeVisible({ timeout: LONG });
    await checkA11y(a, "conversation-empty");
  });

  await test.step("Bob accepts the invitation", async () => {
    await b.getByRole("button", { name: "Accept" }).click({ timeout: LONG });
    await b.getByRole("link", { name: new RegExp(`^${alice.username}`) }).click({ timeout: LONG });
    await expect(b.getByRole("heading", { name: alice.username })).toBeVisible();
  });

  await test.step("messages flow both ways with honest send states", async () => {
    const composerA = a.getByRole("textbox", { name: "Message" });
    await composerA.fill("hello from alice");
    await composerA.press("Enter");
    await expect(messageBody(a, "hello from alice")).toBeVisible();
    await expect(a.getByText("Sent", { exact: true })).toBeVisible({ timeout: LONG });
    await expect(messageBody(b, "hello from alice")).toBeVisible({ timeout: LONG });
    await checkA11y(b, "conversation");
    const composerB = b.getByRole("textbox", { name: "Message" });
    await composerB.fill("hi alice");
    await composerB.press("Enter");
    await expect(messageBody(a, "hi alice")).toBeVisible({ timeout: LONG });
  });

  await test.step("block from details, see it in settings, unblock", async () => {
    await a.getByRole("link", { name: "Details" }).click();
    await expect(a.getByRole("heading", { name: "Conversation details" })).toBeVisible();
    await checkA11y(a, "details");
    await a.getByRole("button", { name: "Block this person" }).click();
    const dialog = a.getByRole("dialog", { name: "Block this person?" });
    await expect(dialog).toContainText("They are not told");
    await checkA11y(a, "dialog");
    await dialog.getByRole("button", { name: "Block this person" }).click();
    await expect(a.getByText(/You blocked this person/)).toBeVisible();
    await expect(a.getByRole("button", { name: "Unblock" })).toBeVisible();
    await a.goto("/settings/blocked");
    await expect(a.getByRole("list", { name: "Blocked users" })).toContainText(bob.username);
    await checkA11y(a, "blocked-users");
    await a.getByRole("button", { name: "Unblock" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "Unblock" }).click();
    await expect(a.getByText("Nobody is blocked")).toBeVisible();
  });

  await test.step("settings: profile, privacy and the notification permission row", async () => {
    await a.goto("/settings");
    await expect(a.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: LONG });
    await checkA11y(a, "settings");
    await a.getByRole("link", { name: /^Profile/ }).click();
    await a.getByLabel("Display name").fill("Alice E2E");
    await a.getByRole("button", { name: "Save" }).click();
    await expect(a.getByText("Display name saved.")).toBeVisible();
    await checkA11y(a, "profile");
    await a.goto("/settings/privacy");
    const receipts = a.getByRole("switch", { name: "Share read receipts" });
    await expect(receipts).toHaveAttribute("aria-checked", "false");
    await receipts.click();
    await expect(receipts).toHaveAttribute("aria-checked", "true");
    // Headless Chromium reports the permission as denied even when the context grants it;
    // the row must show the browser's state, never "not supported" (the unit tests cover the flow).
    await expect(a.getByTestId("notification-permission")).toHaveText(
      /allowed|blocked in your browser settings|not asked yet/,
    );
    await checkA11y(a, "privacy-settings");
    await a.goto("/settings/devices");
    await expect(a.getByRole("heading", { name: "Devices & security" })).toBeVisible();
    await checkA11y(a, "devices");
  });

  await test.step("reload restores the session and the stored setting; Bob sees the new name", async () => {
    await a.reload();
    await expect(a.getByRole("heading", { name: "Devices & security" })).toBeVisible({
      timeout: LONG,
    });
    await a.goto("/settings/privacy");
    await expect(a.getByRole("switch", { name: "Share read receipts" })).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: LONG },
    );
    await b.goto("/chats");
    await expect(b.getByRole("list", { name: "Conversations" })).toContainText("Alice E2E", {
      timeout: LONG,
    });
  });

  await test.step("one tab per device: the second tab is blocked until it takes over", async () => {
    const a2 = await contextA.newPage();
    await a2.goto("/chats");
    await expect(a2.getByText("Already open in another tab")).toBeVisible({ timeout: LONG });
    await checkA11y(a2, "other-tab");
    await a2.getByRole("button", { name: "Use this tab" }).click();
    await expect(a2.getByRole("list", { name: "Conversations" })).toBeVisible({ timeout: LONG });
    await expect(a.getByText("Already open in another tab")).toBeVisible({ timeout: LONG });
    await a.getByRole("button", { name: "Use this tab" }).click();
    await expect(a.getByRole("switch", { name: "Share read receipts" })).toBeVisible({
      timeout: LONG,
    });
    await expect(a2.getByText("Already open in another tab")).toBeVisible({ timeout: LONG });
    await a2.close();
  });

  await test.step("sign out clears the session", async () => {
    await a.goto("/settings");
    await a.getByRole("button", { name: "Sign out of this device" }).click();
    const signedOut = a.getByRole("heading", { name: /^(Sign in|Private messaging, end to end)$/ });
    await expect(signedOut).toBeVisible({ timeout: LONG });
    await a.reload();
    await expect(signedOut).toBeVisible({ timeout: LONG });
    await expect(a.getByRole("link", { name: "Skip to content" })).toHaveCount(0);
  });

  await contextA.close();
  await contextB.close();
});
