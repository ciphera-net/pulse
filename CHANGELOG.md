# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [Unreleased]

- No unreleased changes yet; add items here as you work toward the next release.

## [0.2.0-alpha] - 2026-02-11

### Added

- **Visitor ID storage: optional localStorage for cross-tab unique visitors (PULSE-51).**
  - Default: cross-tab visitor ID in `localStorage` so the same person with multiple tabs/windows (same origin) is counted as one visitor. Optional `data-storage-ttl` attribute sets TTL in hours; after expiry the script regenerates the ID.
  - Optional `data-storage="session"` opts out to per-tab (ephemeral) counting using `sessionStorage`, preserving the previous privacy-first, no-persistent-ID behaviour when desired.
  - Script embed snippet and dashboard copy updated to describe the default and the opt-out. No backend or schema changes; events remain keyed by `session_id`.

## [0.1.0] - 2026-02-09

### Added

- Initial changelog and release process (PULSE-28).
- Release documentation in `docs/releasing.md` and optional changelog check script.

---

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.2.0-alpha...HEAD
[0.2.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.1.0...v0.2.0-alpha
[0.1.0]: https://github.com/ciphera-net/pulse/releases/tag/v0.1.0
