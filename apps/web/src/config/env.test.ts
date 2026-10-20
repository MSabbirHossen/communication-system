import { describe, expect, it } from "vitest";
import { EnvValidationError } from "@cs/validation";
import { loadWebEnv } from "./env";

describe("loadWebEnv", () => {
  it("applies development defaults", () => {
    expect(loadWebEnv({})).toEqual({
      appEnv: "development",
      homeserverUrl: "http://localhost:8008",
      apiUrl: "http://localhost:3000",
    });
  });
  it("rejects a bad URL and names the variable without its value", () => {
    let message = "";
    try {
      loadWebEnv({ VITE_API_URL: "not a url value" });
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      message = (e as Error).message;
    }
    expect(message).toContain("VITE_API_URL");
    expect(message).not.toContain("not a url value");
  });
});
