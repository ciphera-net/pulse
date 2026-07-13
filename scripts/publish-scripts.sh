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
# Required env (CI-only, least-privilege — the ciphera-scripts push creds, NOT
# the general ciphera-assets key):
#   AWS_ACCESS_KEY_ID       (exoscale_cdn_scripts_key)
#   AWS_SECRET_ACCESS_KEY   (exoscale_cdn_scripts_secret)
#   BUNNY_API_KEY           (for the versions.json purge only)
#
# Usage: scripts/publish-scripts.sh
set -euo pipefail

ENDPOINT="https://sos-ch-dk-2.exo.io"
BUCKET="ciphera-scripts"
CDN_HOST="https://js.ciphera.net"
DIST_DIR="dist/scripts"
MANIFEST="public/script-versions.json"

for tool in aws jq curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing required tool: $tool" >&2; exit 1; }
done
[ -f "$MANIFEST" ] || { echo "missing $MANIFEST — run 'npm run build:scripts' first" >&2; exit 1; }

VERSION="$(jq -r '.version' "$MANIFEST")"
[ -n "$VERSION" ] && [ "$VERSION" != "null" ] || { echo "no version in $MANIFEST" >&2; exit 1; }
VDIR="$DIST_DIR/v$VERSION"
[ -d "$VDIR" ] || { echo "missing built artifacts at $VDIR" >&2; exit 1; }

echo "Publishing immutable tracking scripts v$VERSION"

# Immutability guard: refuse to overwrite an already-published version. A version
# is a permanent, content-addressed artifact — new bytes MUST get a new version.
for f in "$VDIR"/*.js; do
  key="v$VERSION/$(basename "$f")"
  if aws s3api head-object --bucket "$BUCKET" --key "$key" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
    echo "REFUSING to overwrite already-published immutable object: $key" >&2
    echo "Bump SCRIPT_VERSION in scripts/build-scripts.mjs to publish changed bytes." >&2
    exit 1
  fi
done

# Upload each versioned file as immutable (1 year, immutable).
for f in "$VDIR"/*.js; do
  key="v$VERSION/$(basename "$f")"
  echo "  -> s3://$BUCKET/$key"
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

echo "Published v$VERSION. Immutable URLs:"
for f in "$VDIR"/*.js; do
  echo "  $CDN_HOST/v$VERSION/$(basename "$f")"
done
