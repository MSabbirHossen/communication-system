#!/usr/bin/env bash
# Drive the on-device spike on a connected Android emulator or device (ADR-0006).
# Expects: adb on PATH, the spike APK path in $1, HOMESERVER_URL reachable from the host
# (the app itself was built for the device's view of it), pnpm workspace built.
# Writes logs to $SPIKE_OUT (default ./spike-out).
set -euo pipefail
APK="${1:?spike apk path}"
OUT="${SPIKE_OUT:-spike-out}"
PKG="org.communicationsystem.app"
ACT="$PKG/.MainActivity"
mkdir -p "$OUT"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"

wait_for_line() { # pattern, timeout seconds
  local pattern="$1" timeout="$2" i
  for i in $(seq 1 "$timeout"); do
    if adb logcat -d -s "Capacitor/Console:*" 2>/dev/null | grep -q -- "$pattern"; then return 0; fi
    if adb logcat -d -s "Capacitor/Console:*" 2>/dev/null | grep -q -- "CS_SPIKE phase ABORTED"; then
      echo "spike aborted while waiting for: $pattern"; return 1
    fi
    sleep 1
  done
  echo "timed out waiting for: $pattern"; return 1
}

adb wait-for-device
adb shell settings put global window_animation_scale 0 >/dev/null || true
adb install -r "$APK"
adb logcat -c
adb shell am start -n "$ACT" >/dev/null
echo "== phase 1: waiting for the spike account"
wait_for_line "CS_SPIKE account " 180
SPIKE_USER="$(adb logcat -d -s 'Capacitor/Console:*' | grep -o 'CS_SPIKE account @[^ ]*' | head -n1 | awk '{print $3}')"
echo "spike account: $SPIKE_USER"
echo "== peer exchange"
( cd "$REPO" && SPIKE_PEER_USER="$SPIKE_USER" SPIKE_PEER_LOG="$OUT/peer.log" NO_COLOR=1 npx vitest run --project mobile-spike 2>&1 | tee -a "$OUT/peer.log" ) || true
wait_for_line "CS_SPIKE phase1 DONE" 240
adb exec-out screencap -p > "$OUT/phase1.png" || true
adb logcat -d -s 'Capacitor/Console:*' > "$OUT/phase1.log"
echo "== restart"
adb shell am force-stop "$PKG"
sleep 2
adb logcat -c
adb shell am start -n "$ACT" >/dev/null
wait_for_line "CS_SPIKE phase2 DONE" 240 || true
adb exec-out screencap -p > "$OUT/phase2.png" || true
adb logcat -d -s 'Capacitor/Console:*' > "$OUT/phase2.log"
adb logcat -d > "$OUT/logcat-full.log" || true
node "$REPO/apps/mobile/scripts/spike-report.mjs" \
  --require web_locks,secure_storage,wasm_crypto,crypto_setup,sync,encrypt_decrypt,reply_sent,peer_roundtrip,session_restores,store_persists,history_persists,revocation,secure_storage_cleared \
  "$OUT/phase1.log" "$OUT/peer.log" "$OUT/phase2.log" | tee "$OUT/report.txt"
