#!/usr/bin/env bash
# * Verifies that CHANGELOG.md has an entry for the given version (e.g. 0.1.0 or v0.1.0).
# * Use before tagging a release; can be wired into CI.
# * Usage: ./scripts/check-changelog.sh <version>

set -e

VERSION="${1:-}"
CHANGELOG="${CHANGELOG:-CHANGELOG.md}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> (e.g. 0.1.0 or v0.1.0)" >&2
  exit 1
fi

# Strip leading 'v' if present for consistent matching
NORMALIZED="${VERSION#v}"

if [ ! -f "$CHANGELOG" ]; then
  echo "Error: $CHANGELOG not found (run from repo root)" >&2
  exit 1
fi

# Keep a Changelog style: ## [1.0.0] or ## [1.0.0] - 2026-02-09
if grep -qE "^## \[${NORMALIZED}\]" "$CHANGELOG"; then
  echo "OK: CHANGELOG has an entry for version $NORMALIZED"
  exit 0
fi

echo "Error: CHANGELOG.md has no entry for version $NORMALIZED (expected a line like '## [$NORMALIZED] - YYYY-MM-DD')" >&2
exit 1
