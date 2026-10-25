#!/usr/bin/env bash
# Drive the on-device spike on the iOS simulator (ADR-0006). Expects a booted simulator,
# the built .app bundle path in $1, a homeserver at HOMESERVER_URL reachable from the host
# (the simulator shares the host network), and the pnpm workspace built.
set -euo pipefail
APP="${1:?path to App.app}"
OUT="${SPIKE_OUT:-spike-out}"
BUNDLE="org.communicationsystem.app"
mkdir -p "$OUT"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
REQUIRED="web_locks,secure_storage,wasm_crypto,crypto_setup,sync,encrypt_decrypt,reply_sent,peer_roundtrip,session_restores,store_persists,history_persists,revocation,secure_storage_cleared"

REPORTED=0
report() {
  [ "$REPORTED" = 1 ] && return 0
  REPORTED=1
  touch "$OUT/phase1.log" "$OUT/peer.log" "$OUT/phase2.log"
  node "$REPO/apps/mobile/scripts/spike-report.mjs" --require "$REQUIRED" \
    "$OUT/phase1.log" "$OUT/peer.log" "$OUT/phase2.log" | tee "$OUT/report.txt" || true
}
# Whatever happens, keep evidence: a screenshot, the app's unified log and a report.
on_exit() {
  local rc=$?
  xcrun simctl io booted screenshot "$OUT/exit.png" >/dev/null 2>&1 || true
  xcrun simctl spawn booted log show --last 20m --style compact \
    --predicate 'process == "App" OR processImagePath CONTAINS "App.app"' > "$OUT/unified.log" 2>/dev/null || true
  kill "$(cat "$OUT/launch.pid" 2>/dev/null)" 2>/dev/null || true
  report
  exit $rc
}
trap on_exit EXIT

launch() { # log file
  xcrun simctl terminate booted "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl launch --console-pty booted "$BUNDLE" > "$1" 2>&1 &
  echo $! > "$OUT/launch.pid"
}
wait_for_line() { # file, pattern, timeout seconds
  local file="$1" pattern="$2" timeout="$3" i
  for i in $(seq 1 "$timeout"); do
    if grep -q -- "$pattern" "$file" 2>/dev/null; then return 0; fi
    if grep -q -- "CS_SPIKE phase ABORTED" "$file" 2>/dev/null; then
      echo "spike aborted while waiting for: $pattern"; return 1
    fi
    sleep 1
  done
  echo "timed out waiting for: $pattern"; return 1
}

xcrun simctl install booted "$APP"
launch "$OUT/phase1.log"
echo "== phase 1: waiting for the spike account"
wait_for_line "$OUT/phase1.log" "CS_SPIKE account " 180
SPIKE_USER="$(grep -o 'CS_SPIKE account @[^ ]*' "$OUT/phase1.log" | head -n1 | awk '{print $3}' | tr -d '\r')"
echo "spike account: $SPIKE_USER"
( cd "$REPO" && SPIKE_PEER_USER="$SPIKE_USER" SPIKE_PEER_LOG="$OUT/peer.log" NO_COLOR=1 \
    npx vitest run --project mobile-spike 2>&1 | tee -a "$OUT/peer.log" ) || true
wait_for_line "$OUT/phase1.log" "CS_SPIKE phase1 DONE" 240
xcrun simctl io booted screenshot "$OUT/phase1.png" || true
echo "== restart"
kill "$(cat "$OUT/launch.pid")" 2>/dev/null || true
launch "$OUT/phase2.log"
wait_for_line "$OUT/phase2.log" "CS_SPIKE phase2 DONE" 240 || true
xcrun simctl io booted screenshot "$OUT/phase2.png" || true
kill "$(cat "$OUT/launch.pid")" 2>/dev/null || true
report
grep -qE "^== [0-9]+ passed, 0 failed, 0 missing" "$OUT/report.txt"
