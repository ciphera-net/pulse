#!/bin/sh
# Mint a short-lived GitHub App installation token for $CI_REPO and print ONLY the token.
# Aegis (ciphera-aegis[bot]). Inputs from Woodpecker secrets + CI env:
#   AEGIS_APP_ID, AEGIS_PRIVATE_KEY (PEM), CI_REPO (owner/repo)
# Needs: openssl, curl, python3. The token expires in 1h; minted fresh per pipeline run.
set -eu
: "${AEGIS_APP_ID:?}"; : "${AEGIS_PRIVATE_KEY:?}"; : "${CI_REPO:?}"

keyfile="$(mktemp)"
trap 'rm -f "$keyfile"' EXIT
printf '%s' "$AEGIS_PRIVATE_KEY" > "$keyfile"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$AEGIS_APP_ID" | b64url)
unsigned="${header}.${payload}"
sig=$(printf '%s' "$unsigned" | openssl dgst -sha256 -sign "$keyfile" -binary | b64url)
jwt="${unsigned}.${sig}"

iid=$(curl -sS --fail --max-time 20 \
  -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${CI_REPO}/installation" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

curl -sS --fail --max-time 20 -X POST \
  -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/${iid}/access_tokens" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"
