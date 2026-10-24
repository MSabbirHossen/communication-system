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
REPORTED=0
report() {
  [ "$REPORTED" = 1 ] && return 0
  REPORTED=1
  report
grep -qE "^== [0-9]+ passed, 0 failed, 0 missing" "$OUT/report.txt"
