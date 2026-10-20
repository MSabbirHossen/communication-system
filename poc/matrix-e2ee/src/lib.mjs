// Pure helpers shared by the PoC scripts. Kept free of I/O so they can be
// unit-tested without a homeserver.

/**
 * Parse `--key value` pairs from argv into an object.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = "true";
      }
    }
  }
  return out;
}

/**
 * Classify a stored room event as the server sees it.
 *
 * Returns `"encrypted-ok"` when the event is a Megolm-encrypted event with a
 * ciphertext and no plaintext fields, `"plaintext-message"` for an unencrypted
 * `m.room.message`, `"encrypted-leak"` when an `m.room.encrypted` event carries
 * a `body` or `msgtype` (which must never happen), and `"other"` for state and
 * non-message events.
 *
 * @param {{ type?: string, content?: Record<string, unknown> }} event
 * @returns {"encrypted-ok" | "encrypted-leak" | "plaintext-message" | "other"}
 */
export function classifyStoredEvent(event) {
  const type = event?.type;
  const c = event?.content ?? {};
  if (type === "m.room.message") return "plaintext-message";
  if (type !== "m.room.encrypted") return "other";
  const ok =
    c.algorithm === "m.megolm.v1.aes-sha2" &&
    typeof c.ciphertext === "string" &&
    c.ciphertext.length > 0 &&
    c.body === undefined &&
    c.msgtype === undefined &&
    c.formatted_body === undefined;
  return ok ? "encrypted-ok" : "encrypted-leak";
}

/**
 * True when `haystack` (a string or Buffer) contains `needle`.
 * @param {string | Uint8Array} haystack
 * @param {string} needle
 */
export function containsPlaintext(haystack, needle) {
  if (typeof haystack === "string") return haystack.includes(needle);
  return Buffer.from(haystack).includes(needle);
}
