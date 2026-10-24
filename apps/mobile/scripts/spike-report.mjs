// Summarise on-device spike output (ADR-0006): reads log files (adb logcat dumps, the iOS
// simulator console, the peer test output), extracts `CS_SPIKE <check> PASS|FAIL …` lines
// and exits non-zero when a required check failed or never reported.
//
//   node scripts/spike-report.mjs --require a,b,c file1.log [file2.log …]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const requireIdx = args.indexOf("--require");
const required = requireIdx >= 0 ? (args[requireIdx + 1] ?? "").split(",").filter(Boolean) : [];
const files = args.filter((a, i) => a !== "--require" && i !== requireIdx + 1);
if (files.length === 0) {
  console.error("usage: spike-report.mjs [--require a,b,c] <log file> […]");
  process.exit(2);
}

const results = new Map();
const notes = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("CS_SPIKE ");
    if (i < 0) continue;
    const rest = line.slice(i + "CS_SPIKE ".length).trim();
    const m = /^(\w+) (PASS|FAIL)(?: (.*))?$/.exec(rest);
    if (m) {
      const prev = results.get(m[1]);
      // Keep the first verdict per check unless a later one is a FAIL.
      if (!prev || m[2] === "FAIL") results.set(m[1], { status: m[2], detail: m[3] ?? "" });
    } else notes.push(rest);
  }
}

console.log("== Device spike report");
for (const n of notes) console.log(`   ${n}`);
let failed = 0;
for (const [name, r] of results) {
  console.log(
    `${r.status === "PASS" ? "PASS" : "FAIL"} ${name}${r.detail ? ` — ${r.detail}` : ""}`,
  );
  if (r.status !== "PASS") failed++;
}
const missing = required.filter((r) => !results.has(r));
for (const m of missing) console.log(`FAIL ${m} — not reported`);
console.log(
  `== ${results.size - failed} passed, ${failed} failed, ${missing.length} missing of ${required.length} required`,
);
process.exit(failed === 0 && missing.length === 0 ? 0 : 1);
