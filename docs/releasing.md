# Releasing Pulse

This document describes how to cut a release for Pulse (changelog, tagging, and deploy). It applies to the **pulse-frontend** repo (GitHub: [ciphera-net/pulse](https://github.com/ciphera-net/pulse)). The backend (pulse-backend) can be tagged separately if you version it; the single product changelog lives here.

## Who updates the changelog

The person cutting the release (or the PR author merging the release PR) is responsible for updating `CHANGELOG.md` before the tag is created. No release tag should be pushed without a corresponding changelog entry.

## When to update

- **Before** creating the git tag for the release.
- Move items from the `[Unreleased]` section into a new version section (e.g. `[0.2.0] - YYYY-MM-DD`), then clear or repopulate `[Unreleased]` as needed.
- Update the comparison links at the bottom of `CHANGELOG.md` (e.g. add `[0.2.0]: ...` and set `[Unreleased]` to `compare/v0.2.0...HEAD`).

## Version numbering (0.x.y)

While Pulse is in initial development we use **0.x.y**:

- **0** = initial development; we may change behaviour or “API” without a new major version.
- **x** (minor) = new features or small breaking changes; bump for a release that adds functionality.
- **y** (patch) = bug fixes only; bump for a release that only fixes bugs.

When we are ready to commit to stability we release **1.0.0** and then follow strict [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How to tag a release

1. Ensure `CHANGELOG.md` has an entry for the new version (see **When to update** above).
2. (Optional) Run the changelog check so the version in the tag matches an entry in the changelog:
   ```bash
   ./scripts/check-changelog.sh 0.2.0
   ```
3. Commit any changelog (and link) updates, merge to the target branch (usually `main` for production).
4. Create an annotated tag (use the same version as in the changelog, with a `v` prefix):
   ```bash
   git tag -a v0.2.0 -m "Release 0.2.0"
   git push origin v0.2.0
   ```

Use the same version number in the tag as in the changelog (e.g. `v0.2.0` ↔ `[0.2.0]`).

## Deploy (staging and production)

- **Staging:** Push to the `staging` branch; Coolify deploys from `staging` to the staging environment.
- **Production:** Only the `main` branch is deployed to production. Merge `staging` → `main` when ready, then push. Tagging (e.g. `v0.2.0`) is done from `main` after the release commit is merged; Coolify auto-deploys on push to `main`.

So the usual flow is: merge release work (including changelog) to `main`, then create and push the tag from `main`.

## Checklist for each release

- [ ] Changelog updated: new version section with date, and `[Unreleased]` updated.
- [ ] Bottom-of-file comparison links updated in `CHANGELOG.md`.
- [ ] (Optional) `./scripts/check-changelog.sh <version>` passes.
- [ ] Changes merged to `main`.
- [ ] Tag created and pushed: `git tag -a vX.Y.Z -m "Release X.Y.Z"` then `git push origin vX.Y.Z`.
