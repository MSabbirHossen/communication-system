import { describe, expect, it } from "vitest";
import { classifyStoredEvent, containsPlaintext, parseArgs } from "./lib.mjs";

describe("parseArgs", () => {
  it("parses --key value pairs", () => {
    expect(parseArgs(["--db", "x.db", "--log", "hs.log"])).toEqual({ db: "x.db", log: "hs.log" });
  });
  it("treats a bare flag as true", () => {
    expect(parseArgs(["--verbose", "--db", "x.db"])).toEqual({ verbose: "true", db: "x.db" });
  });
  it("ignores positional arguments", () => {
    expect(parseArgs(["foo", "--db", "x.db"])).toEqual({ db: "x.db" });
  });
});

describe("classifyStoredEvent", () => {
  const megolm = {
    algorithm: "m.megolm.v1.aes-sha2",
    ciphertext: "AwgAEhA...",
    session_id: "s",
    sender_key: "k",
    device_id: "D",
  };

  it("accepts a well-formed encrypted event", () => {
    expect(classifyStoredEvent({ type: "m.room.encrypted", content: megolm })).toBe("encrypted-ok");
  });
  it("flags an unencrypted message", () => {
    expect(
      classifyStoredEvent({ type: "m.room.message", content: { msgtype: "m.text", body: "hi" } }),
    ).toBe("plaintext-message");
  });
  it("flags an encrypted event that leaks a body", () => {
    expect(
      classifyStoredEvent({ type: "m.room.encrypted", content: { ...megolm, body: "hi" } }),
    ).toBe("encrypted-leak");
  });
  it("flags an encrypted event with the wrong algorithm", () => {
    expect(
      classifyStoredEvent({
        type: "m.room.encrypted",
        content: { ...megolm, algorithm: "m.olm.v1.curve25519-aes-sha2" },
      }),
    ).toBe("encrypted-leak");
  });
  it("flags an encrypted event with empty ciphertext", () => {
    expect(
      classifyStoredEvent({ type: "m.room.encrypted", content: { ...megolm, ciphertext: "" } }),
    ).toBe("encrypted-leak");
  });
  it("classifies state events as other", () => {
    expect(classifyStoredEvent({ type: "m.room.member", content: { membership: "join" } })).toBe(
      "other",
    );
    expect(classifyStoredEvent({})).toBe("other");
  });
});

describe("containsPlaintext", () => {
  it("finds a needle in a string", () => {
    expect(containsPlaintext("abc NONCE-1 def", "NONCE-1")).toBe(true);
    expect(containsPlaintext("abc", "NONCE-1")).toBe(false);
  });
  it("finds a needle in bytes", () => {
    expect(containsPlaintext(Buffer.from("xx NONCE-2 yy"), "NONCE-2")).toBe(true);
    expect(containsPlaintext(new Uint8Array([1, 2, 3]), "NONCE-2")).toBe(false);
  });
});
