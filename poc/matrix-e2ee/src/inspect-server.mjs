// Server-side inspection for the Phase 0 PoC.
//
// Opens the homeserver's SQLite database directly (the "ordinary server-held
// data" of TRD §6.5) and checks that:
//   - every message event in the PoC room is stored as m.room.encrypted,
//   - no stored event JSON contains a plaintext body,
//   - the plaintext nonce and the "must never be sent" strings from the run
//     appear nowhere in the whole DB file nor in the homeserver log,
//   - the device-key table holds public keys only.
//
// Usage: node src/inspect-server.mjs --db <path/to/homeserver.db> [--log <path/to/homeserver.log>] [--nonce-file <last-run.json>]
//   --nonce-file: a second last-run.json (the Phase 2/3 integration run) whose room must hold
//   ciphertext only and whose nonce must be absent from the DB and log as well.
// Reads room id and nonce from last-run.json written by poc.mjs.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStoredEvent, containsPlaintext, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.db) {
  console.error("usage: node src/inspect-server.mjs --db <homeserver.db> [--log <homeserver.log>]");
  process.exit(2);
}

/** @param {string} target */
function resolveFilePath(target) {
  if (!target) return target;
  if (existsSync(target)) return target;
  if (process.env.INIT_CWD) {
    const fromInitCwd = resolve(process.env.INIT_CWD, target);
    if (existsSync(fromInitCwd)) return fromInitCwd;
  }
  const fromWorkspaceRoot = resolve(fileURLToPath(import.meta.url), "../../../", target);
  if (existsSync(fromWorkspaceRoot)) return fromWorkspaceRoot;
  return target;
}

const dbPath = resolveFilePath(args.db);
const logPath = args.log ? resolveFilePath(args.log) : undefined;

const run = JSON.parse(readFileSync(new URL("../last-run.json", import.meta.url), "utf8"));
const { roomId, nonce } = run;
if (!roomId || !nonce) {
  console.error("last-run.json has no roomId/nonce; run poc.mjs first");
  process.exit(2);
}
const forbidden = [nonce, ...(run.forbiddenPlaintexts ?? [])];

/** @type {{ roomId: string, nonce: string, forbiddenPlaintexts?: string[] } | null} */
let extra = null;
if (args["nonce-file"]) {
  const extraPath = resolveFilePath(args["nonce-file"]);
  if (existsSync(extraPath)) {
    extra = JSON.parse(readFileSync(extraPath, "utf8"));
    if (extra?.nonce) forbidden.push(extra.nonce, ...(extra.forbiddenPlaintexts ?? []));
  } else {
    console.error(`nonce file not found: ${extraPath}`);
    process.exit(2);
  }
}

let failed = false;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log(`\n== Inspecting ${dbPath} for room ${roomId}\n`);
const db = new DatabaseSync(dbPath, { readOnly: true });

const rows = /** @type {{ event_id: string, type: string, json: string }[]} */ (
  db
    .prepare(
      `SELECT e.event_id, e.type, ej.json FROM events e JOIN event_json ej ON e.event_id = ej.event_id WHERE e.room_id = ? ORDER BY e.stream_ordering`,
    )
    .all(roomId)
);

check("room events found in server DB", rows.length > 0, `${rows.length} events`);

/** @type {Record<string, number>} */
const typeCounts = {};
const classes = { "encrypted-ok": 0, "encrypted-leak": 0, "plaintext-message": 0, other: 0 };
let jsonLeaks = 0;
for (const row of rows) {
  typeCounts[row.type] = (typeCounts[row.type] ?? 0) + 1;
  classes[classifyStoredEvent(JSON.parse(row.json))]++;
  if (forbidden.some((f) => containsPlaintext(row.json, f))) jsonLeaks++;
}
console.log("  event types:", JSON.stringify(typeCounts));

check("no m.room.message (plaintext) events stored", classes["plaintext-message"] === 0);
check(
  "encrypted events present",
  classes["encrypted-ok"] >= 4,
  `${classes["encrypted-ok"]} m.room.encrypted events`,
);
check("every encrypted event is megolm ciphertext with no body", classes["encrypted-leak"] === 0);
check("no stored event JSON contains a forbidden plaintext", jsonLeaks === 0);

const sample = rows.find((r) => r.type === "m.room.encrypted");
if (sample) {
  const c = JSON.parse(sample.json).content;
  console.log(`  sample ${sample.event_id}:`);
  console.log(`    algorithm=${c.algorithm} session_id=${c.session_id?.slice(0, 12)}…`);
  console.log(`    ciphertext=${c.ciphertext.slice(0, 60)}… (${c.ciphertext.length} chars)`);
  console.log(`    content keys=${Object.keys(c).join(",")}`);
}

if (extra?.roomId) {
  const extraRows = /** @type {{ type: string, json: string }[]} */ (
    db
      .prepare(
        `SELECT e.type, ej.json FROM events e JOIN event_json ej ON e.event_id = ej.event_id WHERE e.room_id = ?`,
      )
      .all(extra.roomId)
  );
  const encrypted = extraRows.filter((r) => r.type === "m.room.encrypted").length;
  const plain = extraRows.filter((r) => r.type === "m.room.message").length;
  check(
    "integration room holds encrypted events only",
    extraRows.length > 0 && encrypted > 0 && plain === 0,
    `${extraRows.length} events, ${encrypted} m.room.encrypted, ${plain} m.room.message`,
  );
}

// Whole-file scan: the plaintext must not exist anywhere in the DB (including
// to-device messages, device keys tables, or anything else).
const dbBytes = readFileSync(dbPath);
const dbLeak = forbidden.find((f) => containsPlaintext(dbBytes, f));
check(
  "forbidden plaintexts absent from the entire DB file",
  !dbLeak,
  `${(dbBytes.length / 1024).toFixed(0)} KiB scanned, ${forbidden.length} strings`,
);

// Device keys table should hold only public key material (no private keys).
const keyRows = /** @type {{ key_json: string }[]} */ (
  db
    .prepare(`SELECT key_json FROM e2e_device_keys_json WHERE user_id IN (?, ?)`)
    .all(run.users.alice, run.users.bob)
);
const privateMaterial = keyRows.some((r) => /private|secret|seed/i.test(r.key_json));
check(
  "device key table holds only public keys",
  keyRows.length >= 3 && !privateMaterial,
  `${keyRows.length} device key records`,
);
const firstKey = keyRows[0];
if (firstKey) console.log(`  sample device key record: ${firstKey.key_json.slice(0, 160)}…`);

if (logPath && existsSync(logPath)) {
  const log = readFileSync(logPath, "utf8");
  const logLeak = forbidden.find((f) => containsPlaintext(log, f));
  check(
    "forbidden plaintexts absent from homeserver log",
    !logLeak,
    `${(log.length / 1024).toFixed(0)} KiB scanned`,
  );
} else {
  console.log("  (no --log given or file missing; log scan skipped)");
}

db.close();
console.log(
  failed
    ? "\n== Server inspection FAILED"
    : "\n== Server inspection passed: the server holds ciphertext only",
);
process.exit(failed ? 1 : 0);
