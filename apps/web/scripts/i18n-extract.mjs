// Export the English message catalogue for translators: `pnpm i18n:extract` writes
// apps/web/i18n/en.json (keys sorted, one string per key). Bengali and Arabic tables are
// produced by translators from this file; nothing machine-drafted is shipped.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogue } from "../src/i18n/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../i18n/en.json");
const entries = Object.entries(catalogue()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
console.log(`${entries.length} messages written to ${out}`);
