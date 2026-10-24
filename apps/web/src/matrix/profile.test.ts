import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { getOwnProfile, setDisplayName, validateDisplayName } from "./profile";

function fakeClient(displayname?: string) {
  const setDisplayNameMock = vi.fn(async () => ({}));
  const client = {
    getUserId: () => "@alice:localhost",
    getProfileInfo: vi.fn(async () => (displayname === undefined ? {} : { displayname })),
    setDisplayName: setDisplayNameMock,
  } as unknown as MatrixClient;
  return { client, setDisplayNameMock };
}

describe("profile", () => {
  it("validates the display name: required, trimmed, at most 100 characters", () => {
    expect(validateDisplayName("")).toBe("required");
    expect(validateDisplayName("   ")).toBe("required");
    expect(validateDisplayName("a".repeat(100))).toBeNull();
    expect(validateDisplayName("a".repeat(101))).toBe("too_long");
    expect(validateDisplayName("  Alice  ")).toBeNull();
  });

  it("reads the own profile, treating an empty display name as none", async () => {
    expect(await getOwnProfile(fakeClient("Alice").client)).toEqual({
      userId: "@alice:localhost",
      displayName: "Alice",
    });
    expect(await getOwnProfile(fakeClient("   ").client)).toEqual({
      userId: "@alice:localhost",
      displayName: null,
    });
    expect((await getOwnProfile(fakeClient().client)).displayName).toBeNull();
  });

  it("sets the trimmed display name and refuses invalid input before any request", async () => {
    const { client, setDisplayNameMock } = fakeClient("Old");
    expect(await setDisplayName(client, "  Alice Example ")).toBe("Alice Example");
    expect(setDisplayNameMock).toHaveBeenCalledWith("Alice Example");
    await expect(setDisplayName(client, " ")).rejects.toThrow(/required/);
    expect(setDisplayNameMock).toHaveBeenCalledTimes(1);
  });
});
