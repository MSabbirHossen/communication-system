import { describe, expect, it } from "vitest";
import { t } from "./index";

describe("t()", () => {
  it("substitutes {placeholders} and leaves unknown ones alone", () => {
    expect(t("chats.unread", { count: 3 })).toBe("3 unread");
    expect(t("auth.error.rate_limited_after", { seconds: 12 })).toBe(
      "Too many attempts. Try again in 12 seconds.",
    );
    expect(t("chats.unread")).toBe("{count} unread");
  });
});
