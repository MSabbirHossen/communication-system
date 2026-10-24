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
REPORTED=0
report() {
  [ "$REPORTED" = 1 ] && return 0
  REPORTED=1
  report
grep -qE "^== [0-9]+ passed, 0 failed, 0 missing" "$OUT/report.txt"
