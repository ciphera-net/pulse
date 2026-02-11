# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [Unreleased]

- No unreleased changes yet; add items here as you work toward the next release.

## [0.2.0-alpha] - 2026-02-11

### Added

- **Smarter unique visitor counts.** If someone opens your site in several tabs or windows, they’re now counted as one visitor by default, so your stats better reflect real people.
- **Control over how visitors are counted.** You can switch back to “one visitor per tab” (more private, no lasting identifier) by adding an option to your script embed. The dashboard shows the right snippet for both options.
- **Optional expiry for the visitor ID.** You can set how long the cross-tab visitor ID is kept (e.g. 24 hours); after that it’s refreshed automatically.

## [0.1.0-alpha] - 2026-02-09

### Added

- Initial changelog and release process.
- Release documentation in `docs/releasing.md` and optional changelog check script.

---

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.2.0-alpha...HEAD
[0.2.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.1.0...v0.2.0-alpha
[0.1.0]: https://github.com/ciphera-net/pulse/releases/tag/v0.1.0
