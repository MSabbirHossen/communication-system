// Privacy-safe scrubbing for log payloads (AGENTS.md §6 "Never log decrypted
// message bodies, private keys or recovery secrets"; TRD §10.3).
//
// Philosophy: logs carry event names and opaque identifiers, never payloads.
// `scrub` is the safety net under that rule: it redacts by key name, by key
// fragment and by value shape, to a bounded depth, without throwing.

export const REDACTED = "[REDACTED]";

/** Keys that are always redacted, whatever their value. */
const SENSITIVE_KEY = new RegExp(
  "^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|password|passwd|pass|pwd|secret|token|" +
    "access_token|accesstoken|refresh_token|id_token|api_key|apikey|private_key|privatekey|recovery_key|" +
    "session_key|signing_key|ciphertext|plaintext|body|content|formatted_body|message_body|otp|pin|" +
    "credential|credentials|macaroon)$",
  "i",
);

/** Key fragments that mark a value as sensitive even in unknown field names. */
const SENSITIVE_FRAGMENT =
  /(token|secret|password|passwd|private|credential|ciphertext|recovery|plaintext)/i;

/** Values that look like bearer tokens or Matrix access tokens. */
const SENSITIVE_VALUE = /^(syt_|syr_|mct_|bearer\s|basic\s|eyJ[A-Za-z0-9_-]{10,}\.)/i;

const MAX_DEPTH = 8;
const MAX_STRING = 2000;
const MAX_KEYS = 200;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || SENSITIVE_FRAGMENT.test(key);
}

function scrubString(value: string): string {
  if (SENSITIVE_VALUE.test(value)) return REDACTED;
  return value.length > MAX_STRING
    ? `${value.slice(0, MAX_STRING)}…[truncated ${value.length - MAX_STRING}]`
    : value;
}

/**
 * Return a copy of `value` safe to log. Never throws; never mutates the input.
 * - Keys matching the sensitive lists become "[REDACTED]".
 * - Strings shaped like tokens become "[REDACTED]"; long strings are truncated.
 * - Errors become { name, message, stack? } (stack only when `includeStack`).
 * - Depth, key count and cycles are bounded.
 */
export function scrub(value: unknown, options: { includeStack?: boolean } = {}): unknown {
  return scrubInner(value, options, 0, new WeakSet<object>());
}

function scrubInner(
  value: unknown,
  options: { includeStack?: boolean },
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    const out: Record<string, unknown> = { name: value.name, message: scrubString(value.message) };
    if (options.includeStack && value.stack) out.stack = value.stack;
    const code = (value as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") out.code = code;
    return out;
  }
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[depth limit]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((v) => scrubInner(v, options, depth + 1, seen));
  }
  if (value instanceof Map || value instanceof Set) {
    return scrubInner(Array.from(value.entries ? value.entries() : []), options, depth, seen);
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return `[binary ${(value as ArrayBufferView).byteLength ?? 0} bytes]`;

  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (n++ >= MAX_KEYS) {
      out["…"] = "[key limit]";
      break;
    }
    out[k] = isSensitiveKey(k) ? REDACTED : scrubInner(v, options, depth + 1, seen);
  }
  return out;
}
