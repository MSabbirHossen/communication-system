import { describe, expect, it } from "vitest";
import { applyConnectSources, connectSources } from "./csp";

describe("connect-src from configuration", () => {
  it("uses the defaults and adds the dev websocket only while serving", () => {
    expect(connectSources({}, "build")).toBe("'self' http://localhost:8008 http://localhost:3000");
    expect(connectSources({}, "serve")).toBe(
      "'self' http://localhost:8008 http://localhost:3000 ws://localhost:5173",
    );
  });

  it("reduces configured URLs to origins and deduplicates", () => {
    expect(
      connectSources(
        {
          VITE_HOMESERVER_URL: "https://matrix.example.org/path",
          VITE_API_URL: "https://matrix.example.org",
        },
        "build",
      ),
    ).toBe("'self' https://matrix.example.org");
    expect(connectSources({ VITE_HOMESERVER_URL: "http://10.0.2.2:8008" }, "build")).toBe(
      "'self' http://10.0.2.2:8008 http://localhost:3000",
    );
  });

  it("fills the placeholder and refuses a template without it", () => {
    expect(applyConnectSources("connect-src __CS_CONNECT_SRC__;", "'self' x")).toBe(
      "connect-src 'self' x;",
    );
    expect(() => applyConnectSources("connect-src 'self';", "'self'")).toThrow(/placeholder/);
  });
});
