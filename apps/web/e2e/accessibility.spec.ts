import { expect, test } from "@playwright/test";
import { checkA11y, hasHorizontalOverflow, newUser, registerAndSetUp, screenshot } from "./helpers";

const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 740 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

test("public screens pass the accessibility gate and fit every supported viewport", async ({
  page,
}, info) => {
  for (const path of ["/", "/login", "/register", "/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await checkA11y(page, `public${path.replace("/", "-")}`);
  }
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(await hasHorizontalOverflow(page), `${vp.name} ${path} overflows`).toBe(false);
      await screenshot(page, info, `${vp.name}${path.replace("/", "-") || "-welcome"}`);
    }
  }
});

test("signed-in screens pass the accessibility gate, fit every viewport and work by keyboard", async ({
  page,
}, info) => {
  const user = newUser("e2e-dana");
  await registerAndSetUp(page, user, (name) => checkA11y(page, name));

  const screens = [
    "/chats",
    "/chats/new",
    "/settings",
    "/settings/profile",
    "/settings/privacy",
    "/settings/blocked",
    "/settings/devices",
  ];
  for (const path of screens) {
    await page.goto(path);
    await expect(page.locator("#main h1").first()).toBeVisible({ timeout: 60_000 });
    await checkA11y(page, `signed-in${path.replace(/\//g, "-")}`);
  }
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of ["/chats", "/settings", "/settings/privacy"]) {
      await page.goto(path);
      await expect(page.locator("#main h1").first()).toBeVisible({ timeout: 60_000 });
      expect(await hasHorizontalOverflow(page), `${vp.name} ${path} overflows`).toBe(false);
      await screenshot(page, info, `${vp.name}${path.replace(/\//g, "-")}`);
    }
  }

  await test.step("keyboard: skip link first, then navigation and content", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");
    await expect(page.locator("#main h1").first()).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Profile/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeFocused();
  });

  await test.step("RTL: the Arabic locale flips the document direction without breaking layout", async () => {
    await page.goto("/settings");
    await page.getByLabel("Language").selectOption("ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // Client-side navigation keeps the chosen locale (it is not persisted across reloads yet).
    await page.getByRole("link", { name: /^Privacy & notifications/ }).click();
    await expect(page.getByRole("switch", { name: "Share read receipts" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await screenshot(page, info, "rtl-settings-privacy");
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});
