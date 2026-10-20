# @cs/logger

Privacy-safe logging for the application API (`@cs/logger`, pino) and the web client (`@cs/logger/browser`, console).

## Allowlist philosophy

Log **event names and opaque identifiers**: `requestId`, method, route, status, duration, hashed or truncated user ids, error codes. Never log payloads: request bodies, message content, tokens, keys, passwords.

The scrubber (`scrub`) is the safety net under that rule, not a substitute for it. It redacts by key name (`authorization`, `password`, `access_token`, `body`, `content`, `ciphertext`, …), by key fragment (`token`, `secret`, `private`, `credential`, `recovery`, `plaintext`), and by value shape (Matrix `syt_` tokens, `Bearer …`, JWT-looking strings). It bounds depth, key count and string length, and never throws.

## Behaviour by environment

| Environment | Default level | Error stacks |
|---|---|---|
| development | info | included |
| test | silent | included |
| production | info | omitted (message and code only) |

No log line ever leaves the process over the network from this package. There is no analytics transport (TRD §9.2).
