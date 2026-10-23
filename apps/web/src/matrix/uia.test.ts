import { describe, expect, it, vi } from "vitest";
import { MatrixError } from "matrix-js-sdk";
import { AuthFailure } from "./errors";
import { passwordUia, UiaCancelled, withPasswordUia } from "./uia";

const challenge = () =>
  new MatrixError(
    { errcode: "M_FORBIDDEN", session: "s1", flows: [{ stages: ["m.login.password"] }] },
    401,
  );

describe("passwordUia", () => {
  it("completes without a prompt when the server does not challenge", async () => {
    const ask = vi.fn(async () => "pw");
    const result = await passwordUia<string>("@a:hs", ask)(async () => "ok");
    expect(result).toBe("ok");
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks for the password once and retries with the password stage", async () => {
    const ask = vi.fn(async () => "correct horse");
    const seen: unknown[] = [];
    const result = await passwordUia<string>(
      "@a:hs",
      ask,
    )(async (auth) => {
      seen.push(auth);
      if (!auth) throw challenge();
      return "done";
    });
    expect(result).toBe("done");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(seen[1]).toEqual({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: "@a:hs" },
      password: "correct horse",
      session: "s1",
    });
  });

  it("propagates cancellation and maps a wrong password to invalid_credentials", async () => {
    await expect(
      passwordUia<void>("@a:hs", async () => {
        throw new UiaCancelled();
      })(async (auth) => {
        if (!auth) throw challenge();
      }),
    ).rejects.toBeInstanceOf(UiaCancelled);

    await expect(
      withPasswordUia(
        "@a:hs",
        async () => "wrong",
        async (auth) => {
          if (!auth) throw challenge();
          throw new MatrixError({ errcode: "M_FORBIDDEN", error: "Invalid password" }, 401);
        },
      ),
    ).rejects.toMatchObject({ error: { code: "invalid_credentials" } });
  });

  it("does not treat non-UIA errors as a challenge", async () => {
    const ask = vi.fn();
    await expect(
      passwordUia<void>(
        "@a:hs",
        ask,
      )(async () => {
        throw new MatrixError({ errcode: "M_LIMIT_EXCEEDED" }, 429);
      }),
    ).rejects.toBeInstanceOf(MatrixError);
    expect(ask).not.toHaveBeenCalled();
    // Keep AuthFailure import used for type symmetry with other tests.
    expect(AuthFailure).toBeDefined();
  });
});
