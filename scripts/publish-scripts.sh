#!/usr/bin/env bash
#
# Publish the immutable, versioned tracking-script artifacts to the CDN origin.
#
# This is ADDITIVE and SAFE by construction: it only ever writes to
#   s3://ciphera-scripts/v<version>/...   (immutable, never overwritten)
#   s3://ciphera-scripts/versions.json    (append-only manifest)
# It NEVER touches the rolling s3://ciphera-scripts/script.js — that byte change
# is a separate, gated "promote" step (see promote-rolling.sh, intentionally not
# part of this script) that goes through canary -> smoke -> promote.
#
# Run AFTER `npm run build:scripts`, which produces dist/scripts/v<version>/ and
# public/script-versions.json.
#
# ⚠️ FIXED 26-08-2026 — THIS PUBLISHED ONLY TO A BUCKET NOBODY SERVES.
# js.ciphera.net is Bunny pull zone 5736065, which has an EMPTY OriginUrl and
# StorageZoneId 1688531: it serves from BUNNY STORAGE (zone ciphera-cdn-scripts),
# NOT from Exoscale SOS. This script wrote every versioned artifact to SOS alone,
# so `publish-scripts.sh` would report success and /v<version>/script.js would
# still 404 at the edge. It is the SAME defect that was found and fixed in
# .woodpecker/deploy.yml on 25-07-2026 for the ROLLING script — the versioned
# publish path was never given the same fix, and stayed wrong because nothing has
# been published through it since the 24-07-2026 bulk copy of SOS into Bunny
# Storage made the two byte-identical. Found while publishing v1.1.0.
#
# Bunny Storage is now PRIMARY (with -f, so a failure is loud) and SOS the BACKUP
# durability leg — the same split deploy.yml and scripts/cdn-env.sh already use.
#
# Required env (least-privilege — the ciphera-scripts push creds, NOT the general
# ciphera-assets key):
#   BUNNY_STORAGE_PASSWORD  (PRIMARY, Bunny Edge Storage zone ciphera-cdn-scripts)
#     ⚠️ The working value is the one in CDNZ_SCRIPTS_PASSWORD. The .env twin named
#     BUNNY_STORAGE_SCRIPTS_PASSWORD returns 401 on write, and
#     BUNNY_EDGE_STORAGE_SCRIPTS_PASSWORD reads fine but cannot PUT — both verified
#     26-08-2026. A read probe succeeding proves nothing about write access.
#   AWS_ACCESS_KEY_ID       (exoscale_cdn_scripts_key)     — backup leg
#   AWS_SECRET_ACCESS_KEY   (exoscale_cdn_scripts_secret)  — backup leg
#   BUNNY_API_KEY           (for the versions.json purge only)
#
# Usage: scripts/publish-scripts.sh
set -euo pipefail

ENDPOINT="https://sos-ch-dk-2.exo.io"
BUCKET="ciphera-scripts"
STORAGE_ZONE="ciphera-cdn-scripts"
STORAGE_HOST="https://storage.bunnycdn.com"
CDN_HOST="https://js.ciphera.net"
DIST_DIR="dist/scripts"
MANIFEST="public/script-versions.json"

for tool in aws jq curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing required tool: $tool" >&2; exit 1; }
done

[ -n "${BUNNY_STORAGE_PASSWORD:-}" ] || {
  echo "BUNNY_STORAGE_PASSWORD is unset — that is the PRIMARY origin." >&2
  echo "Publishing to SOS alone leaves /v<version>/ returning 404 at the edge." >&2
  exit 1
}
[ -f "$MANIFEST" ] || { echo "missing $MANIFEST — run 'npm run build:scripts' first" >&2; exit 1; }

VERSION="$(jq -r '.version' "$MANIFEST")"
[ -n "$VERSION" ] && [ "$VERSION" != "null" ] || { echo "no version in $MANIFEST" >&2; exit 1; }
VDIR="$DIST_DIR/v$VERSION"
[ -d "$VDIR" ] || { echo "missing built artifacts at $VDIR" >&2; exit 1; }

echo "Publishing immutable tracking scripts v$VERSION"

# Immutability guard: refuse to overwrite an already-published version. A version
# is a permanent, content-addressed artifact — new bytes MUST get a new version.
# Probed against the PRIMARY origin: a version present only in the SOS backup is
# not published as far as any visitor is concerned.
for f in "$VDIR"/*.js; do
  key="v$VERSION/$(basename "$f")"
  probe="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "AccessKey: $BUNNY_STORAGE_PASSWORD" "$STORAGE_HOST/$STORAGE_ZONE/$key")"
  if [ "$probe" = "200" ]; then
    echo "REFUSING to overwrite already-published immutable object: $key" >&2
    echo "Bump SCRIPT_VERSION in scripts/build-scripts.mjs to publish changed bytes." >&2
    exit 1
  fi
done

# Upload each versioned file as immutable (1 year, immutable).
# PRIMARY (Bunny Storage) goes first and uses -f, so a failure fails the script
# LOUDLY rather than leaving the version unreachable while SOS reports success.
for f in "$VDIR"/*.js; do
  key="v$VERSION/$(basename "$f")"
  echo "  -> $STORAGE_ZONE/$key (primary)"
  curl -fsS --max-time 120 -X PUT \
    -H "AccessKey: $BUNNY_STORAGE_PASSWORD" \
    -H "Content-Type: application/javascript" \
    --data-binary "@$f" \
    "$STORAGE_HOST/$STORAGE_ZONE/$key" >/dev/null \
    || { echo "PRIMARY (Bunny Storage) upload FAILED for $key — the version would 404 at the edge" >&2; exit 1; }

  echo "  -> s3://$BUCKET/$key (backup)"
  aws s3 cp "$f" "s3://$BUCKET/$key" \
    --endpoint-url "$ENDPOINT" \
    --content-type "application/javascript" \
    --cache-control "public, max-age=31536000, immutable" \
    --acl public-read \
    --quiet
done

# Refresh the append-only manifest. Merge the newly built version entry into
# whatever is already published so history is preserved.
echo "  updating versions.json"
REMOTE_VERSIONS="$(curl -fsS "$CDN_HOST/versions.json" 2>/dev/null || echo '[]')"
LOCAL_ENTRY="$(jq -c --arg v "$VERSION" '{version:$v, publishedAt:null, files:.files}' "$MANIFEST")"
echo "$REMOTE_VERSIONS" \
  | jq --argjson entry "$LOCAL_ENTRY" \
      'if any(.[]; .version == $entry.version) then . else . + [$entry] end' \
  > /tmp/versions.json
curl -fsS --max-time 120 -X PUT \
  -H "AccessKey: $BUNNY_STORAGE_PASSWORD" \
  -H "Content-Type: application/json" \
  --data-binary "@/tmp/versions.json" \
  "$STORAGE_HOST/$STORAGE_ZONE/versions.json" >/dev/null \
  || { echo "PRIMARY (Bunny Storage) upload FAILED for versions.json" >&2; exit 1; }

aws s3 cp /tmp/versions.json "s3://$BUCKET/versions.json" \
  --endpoint-url "$ENDPOINT" \
  --content-type "application/json" \
  --cache-control "public, max-age=300" \
  --acl public-read \
  --quiet

# versions.json is the only mutable object here — purge its edge cache so the
# hash-watcher and snippet UI see the new version promptly. The immutable
# /v<version>/ objects never need purging (they never change).
if [ -n "${BUNNY_API_KEY:-}" ]; then
  curl -fsS -X POST \
    "https://api.bunny.net/purge?url=$CDN_HOST/versions.json&async=false" \
    -H "AccessKey: $BUNNY_API_KEY" >/dev/null || true
fi

# Prove it. A pinned tag carries integrity="<sha384>", so publishing to the wrong
# place or publishing different bytes than the manifest describes does not merely
# fail to help — the browser refuses to execute the script, costing that customer
# every metric. Assert the edge serves the artifact AND that its hash is the one
# ScriptSetupBlock will emit, rather than trusting a 2xx from the upload.
echo "Verifying the edge serves v$VERSION..."
fail=0
for f in "$VDIR"/*.js; do
  name="$(basename "$f")"
  url="$CDN_HOST/v$VERSION/$name"
  tmp="$(mktemp)"
  code="$(curl -s -o "$tmp" -w '%{http_code}' --max-time 60 "$url")"
  if [ "$code" != "200" ]; then
    echo "  FAIL $url -> HTTP $code" >&2; fail=1; rm -f "$tmp"; continue
  fi
  live="sha384-$(openssl dgst -sha384 -binary "$tmp" | openssl base64 -A)"
  want="$(jq -r --arg n "$name" '.files[$n].sha384 // empty' "$MANIFEST")"
  if [ -n "$want" ] && [ "$live" != "$want" ]; then
    echo "  FAIL $url integrity mismatch" >&2
    echo "       edge:     $live" >&2
    echo "       manifest: $want" >&2
    echo "       A pinned tag with this hash would be BLOCKED by the browser." >&2
    fail=1
  else
    echo "  OK   $url ($live)"
  fi
  rm -f "$tmp"
done
[ "$fail" -eq 0 ] || { echo "Publish verification FAILED — do not ship a manifest naming these URLs." >&2; exit 1; }

echo "Published v$VERSION. Immutable URLs:"
for f in "$VDIR"/*.js; do
  echo "  $CDN_HOST/v$VERSION/$(basename "$f")"
done
