#!/usr/bin/env bash
# Start a development Synapse from pip on hosts without Docker (the macOS CI runner for the
# iOS simulator job). Same dev overrides as the compose setup (infrastructure/synapse/
# dev-overrides.yaml), SQLite, bound to 127.0.0.1:8008. Development only.
set -euo pipefail
DIR="${SYNAPSE_DIR:-$RUNNER_TEMP/synapse}"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p "$DIR"
python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install --quiet --upgrade pip
"$DIR/venv/bin/pip" install --quiet matrix-synapse
( cd "$DIR" && "$DIR/venv/bin/python" -m synapse.app.homeserver \
    --server-name localhost --config-path homeserver.yaml --generate-config --report-stats=no >/dev/null )
printf '\n' >> "$DIR/homeserver.yaml"
# Keep the whitelist line out: there is no compose network here.
grep -v -E '^(ip_range_whitelist:|  - "172\.16\.0\.0/12")$' "$REPO/infrastructure/synapse/dev-overrides.yaml" >> "$DIR/homeserver.yaml"
( cd "$DIR" && nohup "$DIR/venv/bin/python" -m synapse.app.homeserver --config-path homeserver.yaml > "$DIR/synapse.log" 2>&1 & )
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8008/_matrix/client/versions >/dev/null 2>&1; then echo "synapse up"; exit 0; fi
  sleep 2
done
echo "synapse did not start"; tail -n 40 "$DIR/synapse.log"; exit 1
