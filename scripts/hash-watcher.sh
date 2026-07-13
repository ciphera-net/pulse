#!/usr/bin/env bash
#
# External hash-watcher: fetch the tracking scripts as the world sees them and
# alert if the bytes don't match an expected hash. This catches a TRUSTED-ORIGIN
# CDN compromise that SRI and CSP cannot — a valid new build served from our own
# origin passes both SRI (customers pin per-version) and CSP (host allowlisted),
# so only an out-of-band integrity check notices unexpected bytes on the rolling
# URL.
#
# Two checks:
#   1. Each immutable /v<version>/<file> MUST match the sha384 in versions.json.
#      These never change, so any mismatch is a compromise — hard alert.
#   2. The rolling /script.js is compared to a pinned "known-good" hash passed in
#      ROLLING_EXPECTED_SHA384 (the hash of the version currently promoted to
#      rolling). A mismatch means the rolling bytes changed — expected right
#      after a promote, suspicious otherwise.
#
# Intended to run as a cron (e.g. every 5 min). Emits to Alertmanager if
# ALERTMANAGER_URL is set; otherwise prints and exits non-zero on mismatch so a
# CI/cron wrapper can alert.
#
# Env:
#   CDN_HOST                 default https://js.ciphera.net
#   ROLLING_EXPECTED_SHA384  optional sha384-... to compare the rolling script to
#   ALERTMANAGER_URL         optional; POST target for alerts
set -uo pipefail

CDN_HOST="${CDN_HOST:-https://js.ciphera.net}"
FAIL=0

sha384_b64() {
  # sha384 of stdin, base64 — matches the SRI "sha384-<b64>" form.
  openssl dgst -sha384 -binary | openssl base64 -A
}

alert() {
  local summary="$1" detail="$2"
  echo "HASH-WATCHER ALERT: $summary — $detail" >&2
  FAIL=1
  if [ -n "${ALERTMANAGER_URL:-}" ]; then
    curl -fsS -X POST "$ALERTMANAGER_URL/api/v2/alerts" \
      -H 'Content-Type: application/json' \
      -d "[{\"labels\":{\"alertname\":\"PulseScriptHashMismatch\",\"severity\":\"critical\",\"service\":\"js.ciphera.net\"},\"annotations\":{\"summary\":\"$summary\",\"description\":\"$detail\"}}]" \
      >/dev/null 2>&1 || true
  fi
}

# 1) Immutable versioned objects must match their manifest hashes exactly.
VERSIONS_JSON="$(curl -fsS "$CDN_HOST/versions.json" 2>/dev/null || echo '[]')"
echo "$VERSIONS_JSON" | jq -c '.[]' 2>/dev/null | while read -r entry; do
  version="$(echo "$entry" | jq -r '.version')"
  echo "$entry" | jq -r '.files | to_entries[] | "\(.key)\t\(.value.sha384)"' | while IFS=$'\t' read -r file expected; do
    url="$CDN_HOST/v$version/$file"
    served="sha384-$(curl -fsS "$url" 2>/dev/null | sha384_b64)"
    if [ "$served" != "$expected" ]; then
      alert "immutable object changed" "$url served $served, manifest expects $expected"
    fi
  done
done

# 2) Rolling script.js vs a pinned known-good hash (if provided).
if [ -n "${ROLLING_EXPECTED_SHA384:-}" ]; then
  served="sha384-$(curl -fsS "$CDN_HOST/script.js" 2>/dev/null | sha384_b64)"
  if [ "$served" != "$ROLLING_EXPECTED_SHA384" ]; then
    alert "rolling script.js hash changed" "served $served, expected $ROLLING_EXPECTED_SHA384 (expected right after a promote; investigate otherwise)"
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "hash-watcher: all served tracking scripts match their expected hashes"
fi
exit "$FAIL"
