import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

export interface TestUser {
  username: string;
  password: string;
}

/** A fresh account name per run; the compose Synapse keeps accounts, so names must not repeat. */
export function newUser(prefix: string): TestUser {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { username: `${prefix}-${nonce}`, password: `E2e-pass-${nonce}-Q` };
}

const LONG = 60_000;

/** The password re-prompt the setup flow shows when the server asks for it. */
async function confirmPasswordIfAsked(page: Page, user: TestUser): Promise<void> {
  const password = page.getByLabel("Password", { exact: true });
  const keyShown = page.getByLabel("Your recovery key");
  const keyAsked = page.getByLabel("Recovery key", { exact: true });
  await expect(password.or(keyShown).or(keyAsked)).toBeVisible({ timeout: LONG });
  if (await password.isVisible()) {
    await password.fill(user.password);
    await page.getByRole("button", { name: "Confirm" }).click();
  }
}

async function finishSetup(page: Page): Promise<void> {
  await expect(page.getByText(/This device is set up|were restored on this device/)).toBeVisible({
    timeout: LONG,
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("No conversations yet").or(page.getByRole("list", { name: "Conversations" })),
  ).toBeVisible({
    timeout: 30_000,
  });
}

/** Register through the UI and complete secure device setup; returns the recovery key shown. */
export async function registerAndSetUp(
  page: Page,
  user: TestUser,
  audit?: (name: string) => Promise<void>,
): Promise<{ recoveryKey: string }> {
  await page.goto("/register");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Secure this device" })).toBeVisible({
    timeout: 30_000,
  });
  await confirmPasswordIfAsked(page, user);
  const key = page.getByLabel("Your recovery key");
  await expect(key).toBeVisible({ timeout: LONG });
  const recoveryKey = ((await key.textContent()) ?? "").trim();
  expect(recoveryKey.length).toBeGreaterThan(20);
  await audit?.("setup-recovery-key");
  await page.getByLabel("I have saved my recovery key").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await finishSetup(page);
  return { recoveryKey };
}

/** Sign in on a new device and restore the identity with the recovery key. */
export async function signInAndRestore(
  page: Page,
  user: TestUser,
  recoveryKey: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Secure this device" })).toBeVisible({
    timeout: 30_000,
  });
  await confirmPasswordIfAsked(page, user);
  const field = page.getByLabel("Recovery key", { exact: true });
  await expect(field).toBeVisible({ timeout: LONG });
  await field.fill(recoveryKey);
  await page.getByRole("button", { name: "Restore" }).click();
  await finishSetup(page);
}

/**
 * Accessibility gate (TRD §12.3, ADR-0005): WCAG 2.x A/AA rules via axe. Serious and
 * critical violations fail the test; moderate and minor ones are recorded as attachments.
 */
export async function checkA11y(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  const describe = (v: (typeof results.violations)[number]) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  });
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const recorded = results.violations.filter((v) => !blocking.includes(v));
  await test.info().attach(`axe-${name}`, {
    body: JSON.stringify(
      { blocking: blocking.map(describe), recorded: recorded.map(describe) },
      null,
      2,
    ),
    contentType: "application/json",
  });
  if (recorded.length > 0) {
    console.log(`axe ${name}: recorded ${recorded.map((v) => `${v.id}(${v.impact})`).join(", ")}`);
  }
  expect(blocking.map(describe), `axe ${name}`).toEqual([]);
}

/** A message bubble with this text (the list preview shows the same text, so match the bubble). */
export function messageBody(page: Page, text: string) {
  return page.locator(".msg__body", { hasText: text });
}

/** True when the document scrolls horizontally (content clipped or overflowing the viewport). */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

/** Full-page screenshot kept as a test artifact (CI uploads e2e-results). */
export async function screenshot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}
